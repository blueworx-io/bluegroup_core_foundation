<?php
namespace Blueworx\PageEditor\v1;

use InvalidArgumentException;

/**
 * A screen definition is data, so every mistake in it is caught here, loudly,
 * at registration — never as a silently missing field on a live screen.
 *
 * KINDS is closed on purpose. It is the design system's control list; a plugin
 * that needs something else adds it to the design system first.
 */
final class Schema {

	const KINDS = [
		'text', 'textarea', 'richtext', 'number', 'range', 'colour', 'date', 'datetime',
		'copytext', 'select', 'radio', 'checkboxes', 'toggle', 'tokens', 'scrolllist',
		'media', 'file', 'repeater', 'record', 'facts', 'table', 'title', 'slug',
	];

	const CHOICE_KINDS = [ 'select', 'radio', 'checkboxes', 'scrolllist', 'record' ];

	/**
	 * The Publish and settings tab the library appends to every record screen
	 * (see Settings::tab()) uses these ids. A plugin's own screen is rejected
	 * if it tries to reuse one, so the appended tab never collides with a
	 * plugin-authored tab or panel of the same id. This only applies to a
	 * record ("post") screen — a settings ("option") screen never gains the
	 * tab, so nothing to collide with.
	 */
	const RESERVED_TAB_IDS   = [ 'publish' ];
	const RESERVED_PANEL_IDS = [ 'status', 'taxonomies', 'parent' ];

	/**
	 * A hideable panel gets a field auto-declared on it — <panel_id>__shown —
	 * so its shown/hidden state flows through Capabilities, Sanitise, Validate
	 * and Store like any other value, rather than being invented by the
	 * browser and dropped by Sanitise::values(), which only keeps values for
	 * fields the schema actually declares. Hence the suffix is reserved: a
	 * plugin field with the same ending on a hideable panel would collide
	 * with the one this library adds.
	 */
	const PANEL_SWITCH_SUFFIX = '__shown';

	/**
	 * The Publish and settings tab's own field ids are reserved the same way:
	 * a plugin field called post_status or post_tags would register fine and
	 * then have its value silently redirected into the post column instead of
	 * its own meta. Derived from Settings::tab() itself, never written out a
	 * second time, so this cannot drift from what that tab actually declares.
	 */
	private static function reservedFieldIds( string $slug ): array {
		$tab = Settings::tab( [ 'store' => 'post', 'slug' => $slug ] );
		$ids = [];
		foreach ( $tab['panels'] ?? [] as $panel ) {
			foreach ( $panel['fields'] as $field ) {
				$ids[] = $field['id'];
			}
		}
		return $ids;
	}

	public static function validate( array $screen ): array {
		if ( empty( $screen['slug'] ) || ! is_string( $screen['slug'] ) ) {
			throw new InvalidArgumentException( 'This editor screen needs a slug.' );
		}
		if ( empty( $screen['title'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen needs a title.', $screen['slug'] ) );
		}

		$screen['store']      = $screen['store'] ?? 'post';
		$screen['capability'] = $screen['capability'] ?? 'manage_options';
		$screen['eyebrow']    = $screen['eyebrow'] ?? '';
		$screen['lede']       = $screen['lede'] ?? '';
		$screen['tabs']       = $screen['tabs'] ?? [];

		if ( ! in_array( $screen['store'], [ 'post', 'option' ], true ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen stores to "%s". It must store to "post" or "option".', $screen['slug'], $screen['store'] ) );
		}
		if ( 'post' === $screen['store'] && empty( $screen['post_type'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen stores a record, so it needs a post_type.', $screen['slug'] ) );
		}
		if ( 'option' === $screen['store'] && empty( $screen['option_name'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen stores to options, so it needs an option_name.', $screen['slug'] ) );
		}

		$seen            = [];
		$tab_ids         = [];
		$panel_ids       = [];
		$dependencies    = [];
		$repeater_scopes = [];
		$check_reserved  = ( 'post' === $screen['store'] );
		$reserved_fields = $check_reserved ? self::reservedFieldIds( $screen['slug'] ) : [];
		foreach ( $screen['tabs'] as $t => $tab ) {
			$screen['tabs'][ $t ] = self::tab( $tab, $screen['slug'], $seen, $tab_ids, $panel_ids, $dependencies, $repeater_scopes, $check_reserved, $reserved_fields );
		}

		self::checkDependencies( $screen['slug'], $seen, $repeater_scopes, $dependencies );

		return $screen;
	}

	/**
	 * Runs one tab through the same id-uniqueness checks and default-filling
	 * every tab on a registered screen gets, without knowing about any other
	 * tab on the screen. Used to normalise the Publish and settings tab
	 * (Settings::tab()) so it produces fields with the same shape — wide,
	 * required, help, depends_on, locked_help, capability — as a field that
	 * came from a plugin's own schema, rather than a hand-shaped second kind
	 * of field the browser would have to special-case.
	 *
	 * Reserved-id checking never applies here: this is how the reserved ids
	 * themselves get onto the screen.
	 */
	public static function normaliseTab( array $tab, string $slug ): array {
		$seen            = [];
		$tab_ids         = [];
		$panel_ids       = [];
		$dependencies    = [];
		$repeater_scopes = [];

		$tab = self::tab( $tab, $slug, $seen, $tab_ids, $panel_ids, $dependencies, $repeater_scopes );
		self::checkDependencies( $slug, $seen, $repeater_scopes, $dependencies );

		return $tab;
	}

	private static function tab( array $tab, string $slug, array &$seen, array &$tab_ids, array &$panel_ids, array &$dependencies, array &$repeater_scopes, bool $check_reserved = false, array $reserved_fields = [] ): array {
		if ( empty( $tab['id'] ) || empty( $tab['label'] ) ) {
			throw new InvalidArgumentException( sprintf( 'Every tab on the "%s" editor screen needs an id and a label.', $slug ) );
		}
		if ( isset( $tab_ids[ $tab['id'] ] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen uses the tab id "%s" twice. Tab ids must be unique across the whole screen.', $slug, $tab['id'] ) );
		}
		if ( $check_reserved && in_array( $tab['id'], self::RESERVED_TAB_IDS, true ) ) {
			throw new InvalidArgumentException( sprintf(
				'The "%s" editor screen uses the tab id "%s", which is reserved for the Publish and settings tab the library adds. Choose a different id.',
				$slug,
				$tab['id']
			) );
		}
		$tab_ids[ $tab['id'] ] = true;

		$tab['panels'] = $tab['panels'] ?? [];
		foreach ( $tab['panels'] as $p => $panel ) {
			$tab['panels'][ $p ] = self::panel( $panel, $slug, $seen, $panel_ids, $dependencies, $repeater_scopes, $check_reserved, $reserved_fields );
		}
		return $tab;
	}

	private static function panel( array $panel, string $slug, array &$seen, array &$panel_ids, array &$dependencies, array &$repeater_scopes, bool $check_reserved = false, array $reserved_fields = [] ): array {
		if ( empty( $panel['id'] ) || empty( $panel['title'] ) ) {
			throw new InvalidArgumentException( sprintf( 'Every panel on the "%s" editor screen needs an id and a title.', $slug ) );
		}
		if ( isset( $panel_ids[ $panel['id'] ] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen uses the panel id "%s" twice. Panel ids must be unique across the whole screen.', $slug, $panel['id'] ) );
		}
		if ( $check_reserved && in_array( $panel['id'], self::RESERVED_PANEL_IDS, true ) ) {
			throw new InvalidArgumentException( sprintf(
				'The "%s" editor screen uses the panel id "%s", which is reserved for the Publish and settings tab the library adds. Choose a different id.',
				$slug,
				$panel['id']
			) );
		}
		$panel_ids[ $panel['id'] ] = true;

		$panel['eyebrow']  = $panel['eyebrow'] ?? '';
		$panel['note']     = $panel['note'] ?? '';
		$panel['hideable'] = (bool) ( $panel['hideable'] ?? false );
		$panel['fields']   = $panel['fields'] ?? [];

		if ( $panel['hideable'] ) {
			foreach ( $panel['fields'] as $existing ) {
				if ( isset( $existing['id'] ) && self::endsWithPanelSwitchSuffix( $existing['id'] ) ) {
					throw new InvalidArgumentException( sprintf(
						'The field "%s" on the "%s" editor screen ends in "%s", which is reserved for a hideable panel\'s own show/hide switch. Choose a different id.',
						$existing['id'],
						$slug,
						self::PANEL_SWITCH_SUFFIX
					) );
				}
			}
		}

		foreach ( $panel['fields'] as $f => $field ) {
			$panel['fields'][ $f ] = self::field( $field, $slug, $seen, null, $dependencies, $repeater_scopes, $reserved_fields );
		}

		// Added after the plugin's own fields are validated, so it never
		// collides with a field id the loop above already claimed, and after
		// the reserved-suffix check above, so this is the only field ever
		// allowed to end in the reserved suffix.
		if ( $panel['hideable'] ) {
			$panel['fields'][] = self::field( [
				'id'           => $panel['id'] . self::PANEL_SWITCH_SUFFIX,
				'kind'         => 'toggle',
				'label'        => 'Shown',
				'panel_switch' => true,
				// A panel nobody has touched has not been hidden — the kind's
				// own default (false) would collapse every hideable panel on
				// a brand-new record, so this one field overrides it.
				'default'      => true,
			], $slug, $seen, null, $dependencies, $repeater_scopes, $reserved_fields );
		}

		return $panel;
	}

	private static function endsWithPanelSwitchSuffix( string $id ): bool {
		$suffix = self::PANEL_SWITCH_SUFFIX;
		return substr( $id, -strlen( $suffix ) ) === $suffix;
	}

	/** The value Store::read() hands back for a field of this kind when it has never been saved. */
	private static function defaultForKind( string $kind ) {
		switch ( $kind ) {
			case 'toggle':
				return false;

			case 'number':
			case 'range':
			case 'media':
			case 'file':
			case 'record':
				return 0;

			case 'checkboxes':
			case 'scrolllist':
			case 'tokens':
			case 'repeater':
				return [];

			default:
				return '';
		}
	}

	/**
	 * Validates one field. Also called, with a fresh $seen set and the
	 * repeater's own id, to validate a repeater's sub-fields — so a repeater
	 * cell gets the same kind/label/options checks and the same defaults as a
	 * top-level field, without a second copy of those checks.
	 *
	 * $dependencies collects every depends_on found anywhere on the screen, to
	 * be resolved once the whole screen is known — see checkDependencies().
	 * That lets a field depend on one declared later, in a later tab or panel.
	 */
	private static function field( array $field, string $slug, array &$seen, ?string $repeater_id, array &$dependencies, array &$repeater_scopes, array $reserved_fields = [] ): array {
		if ( empty( $field['id'] ) ) {
			throw new InvalidArgumentException( sprintf( 'Every field on the "%s" editor screen needs an id.', $slug ) );
		}
		if ( isset( $seen[ $field['id'] ] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen uses the field id "%s" twice. Every field id is saved as its own value, so they must be unique across the whole screen.', $slug, $field['id'] ) );
		}
		// A repeater's sub-fields are checked too. Their values are stored
		// nested, so nothing would be redirected into a post column — but a
		// sub-field called post_status reads as if it sets the status, and a
		// name that means one thing at the top of a screen and something else
		// inside a repeater is a trap for whoever writes the schema next.
		if ( in_array( $field['id'], $reserved_fields, true ) ) {
			throw new InvalidArgumentException( sprintf(
				'The "%s" editor screen uses the field id "%s", which is reserved for the Publish and settings tab the library adds. Choose a different id.',
				$slug,
				$field['id']
			) );
		}
		$seen[ $field['id'] ] = true;

		if ( array_key_exists( 'depends_on', $field ) && null !== $field['depends_on'] ) {
			$on = $field['depends_on'];
			if ( ! is_array( $on ) || ! array_key_exists( 'field', $on ) || ! array_key_exists( 'value', $on ) ) {
				throw new InvalidArgumentException( sprintf( 'The field "%s" on the "%s" editor screen has a depends_on that is not usable. It needs a "field" and a "value".', $field['id'], $slug ) );
			}
			$dependencies[] = [
				'field_id'    => $field['id'],
				'repeater_id' => $repeater_id,
				'target'      => $on['field'],
			];
		}

		if ( empty( $field['kind'] ) || ! in_array( $field['kind'], self::KINDS, true ) ) {
			throw new InvalidArgumentException( sprintf(
				'The field "%s" on the "%s" editor screen asks for "%s", which is not a control the design system has. Use one of: %s. If you need something else, add it to the design system first.',
				$field['id'],
				$slug,
				$field['kind'] ?? '',
				implode( ', ', self::KINDS )
			) );
		}
		if ( null !== $repeater_id && 'repeater' === $field['kind'] ) {
			throw new InvalidArgumentException( sprintf( 'The repeater "%s" on the "%s" editor screen contains another repeater, "%s". A repeater cannot contain a repeater.', $repeater_id, $slug, $field['id'] ) );
		}
		if ( empty( $field['label'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The field "%s" on the "%s" editor screen needs a label.', $field['id'], $slug ) );
		}
		if ( in_array( $field['kind'], self::CHOICE_KINDS, true ) && empty( $field['options'] ) && 'record' !== $field['kind'] ) {
			throw new InvalidArgumentException( sprintf( 'The field "%s" on the "%s" editor screen is a %s, so it needs options.', $field['id'], $slug, $field['kind'] ) );
		}

		$field['help']        = $field['help'] ?? '';
		$field['required']    = (bool) ( $field['required'] ?? false );
		$field['capability']  = $field['capability'] ?? '';
		$field['locked_help'] = $field['locked_help'] ?? '';
		$field['depends_on']  = $field['depends_on'] ?? null;
		$field['wide']        = (bool) ( $field['wide'] ?? in_array( $field['kind'], [ 'richtext', 'repeater', 'media', 'file', 'table', 'facts', 'title' ], true ) );
		// What Store::read() hands back for this field when it has never
		// been saved. A plugin may declare its own; otherwise it follows the
		// kind, so a never-touched toggle reads false and a never-touched
		// list reads [] rather than every kind sharing the single '' a bare
		// unset value would otherwise be.
		$field['default']     = array_key_exists( 'default', $field ) ? $field['default'] : self::defaultForKind( $field['kind'] );

		if ( null === $repeater_id && 'repeater' === $field['kind'] ) {
			if ( empty( $field['fields'] ) ) {
				throw new InvalidArgumentException( sprintf( 'The repeater "%s" on the "%s" editor screen needs at least one sub-field.', $field['id'], $slug ) );
			}
			$sub_seen = [];
			foreach ( $field['fields'] as $sf => $sub_field ) {
				$field['fields'][ $sf ] = self::field( $sub_field, $slug, $sub_seen, $field['id'], $dependencies, $repeater_scopes, $reserved_fields );
			}
			$repeater_scopes[ $field['id'] ] = $sub_seen;
		}

		return $field;
	}

	/**
	 * Resolves every depends_on collected while walking the screen, now that
	 * every field id — top-level and, per repeater, sub-field — is known. Runs
	 * after the whole screen is walked so a field may depend on one declared
	 * later.
	 *
	 * A top-level field may only depend on another top-level field; a repeater
	 * sub-field may only depend on another sub-field in the same repeater. Sub-
	 * field values live inside rows, so a dependency that crosses that boundary
	 * has no meaning.
	 */
	private static function checkDependencies( string $slug, array $seen, array $repeater_scopes, array $dependencies ): void {
		foreach ( $dependencies as $dep ) {
			$field_id    = $dep['field_id'];
			$repeater_id = $dep['repeater_id'];
			$target      = $dep['target'];

			if ( null === $repeater_id ) {
				if ( isset( $seen[ $target ] ) ) {
					continue;
				}
				if ( self::inAnyRepeater( $target, $repeater_scopes ) ) {
					throw new InvalidArgumentException( sprintf(
						'The field "%s" on the "%s" editor screen depends on "%s", which is a field inside a repeater. A top-level field can only depend on another top-level field.',
						$field_id,
						$slug,
						$target
					) );
				}
				throw new InvalidArgumentException( sprintf(
					'The field "%s" on the "%s" editor screen depends on "%s", which is not a field on the "%s" editor screen.',
					$field_id,
					$slug,
					$target,
					$slug
				) );
			}

			if ( isset( $repeater_scopes[ $repeater_id ][ $target ] ) ) {
				continue;
			}
			if ( isset( $seen[ $target ] ) || self::inAnyRepeater( $target, $repeater_scopes ) ) {
				throw new InvalidArgumentException( sprintf(
					'The field "%s" in the repeater "%s" on the "%s" editor screen depends on "%s", which is not a field in the same repeater. A repeater sub-field can only depend on another field in the same repeater.',
					$field_id,
					$repeater_id,
					$slug,
					$target
				) );
			}
			throw new InvalidArgumentException( sprintf(
				'The field "%s" in the repeater "%s" on the "%s" editor screen depends on "%s", which is not a field on the "%s" editor screen.',
				$field_id,
				$repeater_id,
				$slug,
				$target,
				$slug
			) );
		}
	}

	private static function inAnyRepeater( string $target, array $repeater_scopes ): bool {
		foreach ( $repeater_scopes as $scope ) {
			if ( isset( $scope[ $target ] ) ) {
				return true;
			}
		}
		return false;
	}
}
