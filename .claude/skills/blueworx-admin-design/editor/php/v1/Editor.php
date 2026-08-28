<?php
namespace Blueworx\PageEditor\v1;

/**
 * The whole public surface of the library. A plugin calls register() with its
 * screen definition and does nothing else.
 */
final class Editor {

	/** @var array<string,array> slug => screen definition */
	private static $screens = [];

	/** @var array<string,string> slug => why the screen will not run */
	private static $problems = [];

	public static function register( array $screen ): void {
		$screen = Schema::validate( $screen );
		self::$screens[ $screen['slug'] ] = $screen;
	}

	/** @return array<string,array> */
	public static function all(): array {
		return self::$screens;
	}

	public static function get( string $slug ): ?array {
		return self::$screens[ $slug ] ?? null;
	}

	/**
	 * Whether this screen can actually run. A record editor whose post type
	 * nobody registered does not load: post meta on a post type that does not
	 * exist saves nothing, silently, and the site owner would have no way to
	 * tell. Better to refuse and say so.
	 */
	public static function ready( string $slug ): bool {
		$screen = self::get( $slug );
		if ( null === $screen ) {
			return false;
		}
		if ( 'post' === $screen['store'] && ! post_type_exists( $screen['post_type'] ) ) {
			self::$problems[ $slug ] = sprintf(
				'This editor is not ready. It saves a "%s" record, and that record type has not been set up on this site yet. Ask whoever installed the plugin to finish setting it up.',
				$screen['post_type']
			);
			return false;
		}
		unset( self::$problems[ $slug ] );
		return true;
	}

	public static function problem( string $slug ): string {
		return self::$problems[ $slug ] ?? '';
	}

	/**
	 * For a record ("post") screen, confirms the id is a real post of this
	 * screen's own post type, and that the current user may edit that
	 * specific post — not merely that they hold the screen's own capability.
	 * Without this, any user who can open one editor screen could post an
	 * arbitrary id and overwrite an unrelated post's columns and meta: the
	 * capability check above only ever looks at the screen, and an int cast
	 * on its own proves nothing about which post that id belongs to.
	 *
	 * An option screen has no record id at all, so this never applies to it.
	 *
	 * The same refusal covers "no such id" and "a post of a different type":
	 * telling those apart would let a caller use the endpoint to find out
	 * what exists on the site.
	 */
	private static function authoriseRecord( array $screen, int $id ): ?string {
		if ( 'post' !== $screen['store'] ) {
			return null;
		}
		if ( $id <= 0 ) {
			return 'That record could not be found.';
		}
		$post = get_post( $id );
		if ( null === $post || ! isset( $post->post_type ) || $screen['post_type'] !== $post->post_type ) {
			return 'That record could not be found.';
		}
		if ( ! current_user_can( 'edit_post', $id ) ) {
			return 'You do not have permission to edit this record.';
		}
		return null;
	}

	/**
	 * The registered screen with the Publish and settings tab (Settings::tab())
	 * appended, when one applies. This is the one place that merge happens;
	 * load() and save() both work from this, and everything downstream of them
	 * — Capabilities, Sanitise, Validate, Store — sees only the merged screen,
	 * never the plugin's bare one. Reading or saving from the bare screen would
	 * mean the settings tab renders but its values are never read back and are
	 * dropped on the way in, which is exactly the bug this exists to prevent.
	 */
	private static function screenFor( string $slug ): ?array {
		$screen = self::get( $slug );
		if ( null === $screen ) {
			return null;
		}
		$extra = Settings::tab( $screen );
		if ( null !== $extra ) {
			$screen['tabs'][] = $extra;
		}
		return $screen;
	}

	/**
	 * Everything the screen needs to draw itself: the schema this user is
	 * allowed to see, and the values behind it.
	 */
	public static function load( string $slug, int $id = 0 ): array {
		$screen = self::get( $slug );
		if ( null === $screen ) {
			return [ 'schema' => null, 'values' => [], 'problem' => self::problem( $slug ) ];
		}
		// The REST route's permission_callback is the first gate, but load()
		// is public API: a WP-CLI command, another plugin, or a future
		// admin-post handler could call it directly, bypassing that gate
		// entirely. save() already checked this; load() must too, or reading
		// a screen never requires the capability that opening it does.
		if ( ! current_user_can( $screen['capability'] ) ) {
			return [ 'schema' => null, 'values' => [], 'problem' => 'You do not have permission to open this editor.' ];
		}
		if ( ! self::ready( $slug ) ) {
			return [ 'schema' => null, 'values' => [], 'problem' => self::problem( $slug ) ];
		}
		$merged  = self::screenFor( $slug );
		$refusal = self::authoriseRecord( $merged, $id );
		if ( null !== $refusal ) {
			return [ 'schema' => null, 'values' => [], 'problem' => $refusal ];
		}
		$visible = Capabilities::filterSchema( $merged );
		$values  = Store::for( $merged )->read( $id );

		return [
			'schema' => $visible,
			'values' => Capabilities::filterValuesForDisplay( $merged, $values ),
		];
	}

	/**
	 * A validation failure writes nothing at all: values are checked before
	 * anything is written, so if any is invalid nothing reaches the store —
	 * that guarantee still holds. A write failure is a different matter: post
	 * meta and the post itself have no transaction, so it can leave part of
	 * the record already committed, and the message below says so rather
	 * than claiming otherwise.
	 */
	public static function save( string $slug, array $values, int $id = 0 ): array {
		$screen = self::get( $slug );
		if ( null === $screen ) {
			return [ 'ok' => false, 'errors' => [ '_screen' => 'That editor screen does not exist.' ] ];
		}
		if ( ! current_user_can( $screen['capability'] ) ) {
			return [ 'ok' => false, 'errors' => [ '_screen' => 'You do not have permission to change this.' ] ];
		}
		if ( ! self::ready( $slug ) ) {
			return [ 'ok' => false, 'errors' => [ '_screen' => self::problem( $slug ) ] ];
		}

		$merged  = self::screenFor( $slug );
		$refusal = self::authoriseRecord( $merged, $id );
		if ( null !== $refusal ) {
			return [ 'ok' => false, 'errors' => [ '_screen' => $refusal ] ];
		}

		// Sanitised and validated against the fields this user may write, not
		// against the screen as declared — see Capabilities::writableSchema().
		$writable = Capabilities::writableSchema( $merged );
		$given    = Capabilities::filterValues( $merged, $values );
		$clean    = Sanitise::values( $writable, $given );
		$errors   = Validate::run( $writable, $clean );

		if ( $errors ) {
			return [ 'ok' => false, 'errors' => $errors ];
		}

		$store = Store::for( $merged );

		if ( ! $store->write( $clean, $id ) ) {
			return [
				'ok'     => false,
				'errors' => [ '_screen' => 'Some of your changes may not have saved. Reload the screen to see what changed, then try again.' ],
			];
		}

		// The browser replaces its whole record with this, so it has to be the
		// same shape load() sends: the record as stored, read back and filtered
		// for display. Handing back $clean instead would drop every read-only
		// field — capability filtering already stripped them — and the screen
		// would empty them and still read clean.
		return [
			'ok'     => true,
			'values' => Capabilities::filterValuesForDisplay( $merged, $store->read( $id ) ),
		];
	}

	public static function reset(): void {
		self::$screens = [];
		self::$problems = [];
	}

	public static function boot(): void {
		Screen::boot();
		Rest::boot();
	}
}
