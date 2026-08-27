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
				'This editor saves a record to the "%s" post type, and nothing has registered that post type. Register it with register_post_type() before this screen can open.',
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
	 * Everything the screen needs to draw itself: the schema this user is
	 * allowed to see, and the values behind it.
	 */
	public static function load( string $slug, int $id = 0 ): array {
		$screen = self::get( $slug );
		if ( null === $screen || ! self::ready( $slug ) ) {
			return [ 'schema' => null, 'values' => [], 'problem' => self::problem( $slug ) ];
		}
		$visible = Capabilities::filterSchema( $screen );
		$values  = Store::for( $screen )->read( $id );

		$extra = Settings::tab( $screen );
		if ( null !== $extra ) {
			$visible['tabs'][] = Capabilities::filterSchema( [ 'tabs' => [ $extra ] ] )['tabs'][0];
		}

		return [
			'schema' => $visible,
			'values' => Capabilities::filterValues( $screen, $values ),
		];
	}

	/**
	 * The whole record, or nothing. A part-written record is worse than a
	 * rejected one: the site owner would have no way to tell which half landed.
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

		$writable = Capabilities::filterValues( $screen, $values );
		$clean    = Sanitise::values( $screen, $writable );
		$errors   = Validate::run( $screen, $clean );

		if ( $errors ) {
			return [ 'ok' => false, 'errors' => $errors ];
		}

		if ( ! Store::for( $screen )->write( $clean, $id ) ) {
			return [ 'ok' => false, 'errors' => [ '_screen' => 'This could not be saved. Nothing was changed. Try again.' ] ];
		}

		return [ 'ok' => true, 'values' => $clean ];
	}

	public static function reset(): void {
		self::$screens = [];
		self::$problems = [];
	}
}
