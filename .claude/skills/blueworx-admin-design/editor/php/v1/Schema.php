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
		'media', 'file', 'repeater', 'record', 'facts', 'table', 'gantt', 'title', 'slug',
	];

	const CHOICE_KINDS = [ 'select', 'radio', 'checkboxes', 'scrolllist', 'record' ];

	/**
	 * What a repeater row may hold. Still narrower than KINDS, and still for
	 * the same reason: this list says what the browser actually draws in a
	 * row, so a kind may only be added here once Repeater() in
	 * blueworx-page-editor.js has a case for it. A wider list than the screen
	 * can keep to is how a plugin ends up with a select that registers
	 * cleanly, renders as a text box and saves whatever was typed into it —
	 * which is what this list existed to prevent when it held two kinds.
	 *
	 * Sanitise::field() already cleans each cell by its own kind, so nothing
	 * on the server side had to change to widen it.
	 *
	 * A url or email cell is a 'text' with a 'format', not a kind of its own.
	 */
	const REPEATER_KINDS = [ 'text', 'number', 'textarea', 'select', 'toggle', 'media' ];

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
	 * The two post columns the library owns that the Publish tab does not
	 * carry: the record's own title and body. A record screen is expected to
	 * declare them — that is how a record gets a title at all, and
	 * PostStore::POST_COLUMNS routes them to the post rather than to meta.
	 * So unlike the Publish tab's ids they are reserved only inside a
	 * repeater, where a row's cells are stored nested and a cell with one of
	 * these ids reads as if it set the record's title and sets nothing.
	 */
	const POST_COLUMN_FIELD_IDS = [ 'post_title', 'post_content' ];

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

		// Shape first, everything else after. A tabs list that is not a list —
		// or, below, a tab, panel or field that is not an array — would
		// otherwise reach a typed parameter and raise a raw PHP TypeError,
		// which names an internal method and an argument position rather than
		// the part of the schema that is wrong.
		if ( ! is_array( $screen['tabs'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen has tabs that are not a list. Give it a list of tabs, each one an array.', $screen['slug'] ) );
		}

		if ( ! in_array( $screen['store'], [ 'post', 'option' ], true ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen stores to "%s". It must store to "post" or "option".', $screen['slug'], $screen['store'] ) );
		}
		if ( 'post' === $screen['store'] && empty( $screen['post_type'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen stores a record, so it needs a post_type.', $screen['slug'] ) );
		}
		$owns_storage = isset( $screen['read'] ) || isset( $screen['write'] );
		if ( $owns_storage ) {
			self::checkOwnStorage( $screen );
		}
		if ( 'option' === $screen['store'] && ! $owns_storage && empty( $screen['option_name'] ) ) {
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
			if ( ! is_array( $tab ) ) {
				throw new InvalidArgumentException( sprintf( 'The "%s" editor screen has a tab that is not an array. Every tab is an array with an id, a label and panels.', $screen['slug'] ) );
			}
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
		if ( ! is_array( $tab['panels'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The tab "%s" on the "%s" editor screen has panels that are not a list. Give it a list of panels, each one an array.', $tab['id'], $slug ) );
		}
		foreach ( $tab['panels'] as $p => $panel ) {
			if ( ! is_array( $panel ) ) {
				throw new InvalidArgumentException( sprintf( 'The tab "%s" on the "%s" editor screen has a panel that is not an array. Every panel is an array with an id, a title and fields.', $tab['id'], $slug ) );
			}
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

		if ( ! is_array( $panel['fields'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The panel "%s" on the "%s" editor screen has fields that are not a list. Give it a list of fields, each one an array.', $panel['id'], $slug ) );
		}
		foreach ( $panel['fields'] as $given ) {
			if ( ! is_array( $given ) ) {
				throw new InvalidArgumentException( sprintf( 'The panel "%s" on the "%s" editor screen has a field that is not an array. Every field is an array with an id, a kind and a label.', $panel['id'], $slug ) );
			}
		}

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
	private static function defaultForKind( array $field ) {
		switch ( $field['kind'] ) {
			case 'toggle':
				return false;

			case 'number':
			case 'range':
				return self::defaultZeroClampedToRange( $field );

			case 'media':
			case 'file':
			case 'record':
				return 0;

			case 'checkboxes':
			case 'scrolllist':
			case 'tokens':
			case 'repeater':
			case 'gantt':
				return [];

			default:
				return '';
		}
	}

	/**
	 * 0 is the default a number/range field gets when it declares none of
	 * its own — except Sanitise clamps every value to a declared min/max and
	 * can never actually produce a 0 outside that range, so a fresh screen
	 * would open already showing a value the field would refuse the moment
	 * anyone saved it. Only min above zero or max below zero can ever move
	 * this: any range straddling zero already accepts 0 as-is.
	 */
	/**
	 * A screen may keep its values somewhere this library does not know about,
	 * by supplying both a read and a write callback. See CallbackStore.
	 *
	 * Settings screens only. A record screen's values belong to its post —
	 * that is what "records are post types" means, and a record editor that
	 * quietly stored its values elsewhere would keep the post's own status,
	 * slug and revisions while writing everything else out of reach of them.
	 *
	 * Both or neither: a screen that reads from one place and writes to
	 * another loses every edit on reload, and does it silently.
	 */
	private static function checkOwnStorage( array $screen ): void {
		if ( 'post' === $screen['store'] ) {
			throw new InvalidArgumentException( sprintf(
				'The "%s" editor screen supplies its own read and write, which only a settings screen may do. A record screen stores to its post.',
				$screen['slug']
			) );
		}
		if ( ! isset( $screen['read'], $screen['write'] ) ) {
			throw new InvalidArgumentException( sprintf(
				'The "%s" editor screen supplies only one of read and write. Supply both, or neither.',
				$screen['slug']
			) );
		}
		foreach ( [ 'read', 'write' ] as $which ) {
			if ( ! is_callable( $screen[ $which ] ) ) {
				throw new InvalidArgumentException( sprintf(
					'The "%s" editor screen\'s %s is not callable.',
					$screen['slug'],
					$which
				) );
			}
		}
	}

	/**
	 * A text field's optional list of values to pick from, offered as a
	 * <datalist>. Unlike options on a select these are a shortcut and not a
	 * constraint — the field stays free text and Sanitise never checks a
	 * value against them, because the whole point is a field whose likely
	 * answers are known but whose possible answers are not. A link field is
	 * the case that asked for it: most links point at one of the site's own
	 * pages, and plenty do not.
	 *
	 * Only meaningful on a text field. Declared anywhere else it is a
	 * mistake worth naming rather than ignoring, because the control that
	 * kind draws has nowhere to put it.
	 *
	 * @return array<int,array{value:string,label:string}>
	 */
	private static function suggestions( array $field, string $slug ): array {
		if ( ! array_key_exists( 'suggestions', $field ) ) {
			return [];
		}
		if ( 'text' !== $field['kind'] ) {
			throw new InvalidArgumentException( sprintf(
				'The field "%s" on the "%s" editor screen offers suggestions, which only a "text" field can — this one is a "%s".',
				$field['id'],
				$slug,
				$field['kind']
			) );
		}
		if ( ! is_array( $field['suggestions'] ) ) {
			throw new InvalidArgumentException( sprintf(
				'The field "%s" on the "%s" editor screen declares suggestions that are not a list.',
				$field['id'],
				$slug
			) );
		}

		$out = [];
		foreach ( $field['suggestions'] as $suggestion ) {
			if ( ! is_array( $suggestion ) || ! isset( $suggestion['value'] ) ) {
				throw new InvalidArgumentException( sprintf(
					'A suggestion on the field "%s" of the "%s" editor screen has no value. Each one needs a value, and a label to show beside it.',
					$field['id'],
					$slug
				) );
			}
			$value = (string) $suggestion['value'];
			if ( '' === $value ) {
				continue;
			}
			$out[] = [
				'value' => $value,
				// A suggestion with no label of its own shows its own value,
				// which is still usable — an address is readable, if plain.
				'label' => (string) ( $suggestion['label'] ?? $value ),
			];
		}
		return $out;
	}

	private static function defaultZeroClampedToRange( array $field ) {
		$value = 0;
		if ( isset( $field['min'] ) && (int) $field['min'] > $value ) {
			$value = (int) $field['min'];
		}
		if ( isset( $field['max'] ) && (int) $field['max'] < $value ) {
			$value = (int) $field['max'];
		}
		return $value;
	}

	/**
	 * Whether a declared default is even the right shape for its field's
	 * kind. Checked at registration, where this library puts every loud
	 * failure: Store::read() also runs a default through castByKind() on
	 * the way out, but that is a defensive fallback for a hand-built screen
	 * that skipped Schema::validate() entirely, not a substitute for telling
	 * whoever wrote the schema what they got wrong.
	 */
	private static function defaultMatchesKind( $value, string $kind ): bool {
		switch ( $kind ) {
			case 'toggle':
				return is_bool( $value );

			case 'number':
			case 'range':
			case 'media':
			case 'file':
			case 'record':
				return is_int( $value );

			case 'checkboxes':
			case 'scrolllist':
			case 'tokens':
			case 'repeater':
			case 'gantt':
				return is_array( $value );

			default:
				return is_string( $value );
		}
	}

	private static function defaultTypeLabel( string $kind ): string {
		switch ( $kind ) {
			case 'toggle':
				return 'a boolean';

			case 'number':
			case 'range':
			case 'media':
			case 'file':
			case 'record':
				return 'an integer';

			case 'checkboxes':
			case 'scrolllist':
			case 'tokens':
			case 'repeater':
			case 'gantt':
				return 'an array';

			default:
				return 'a string';
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
		// The record's own title and body are a screen's to declare — see
		// POST_COLUMN_FIELD_IDS — but only at the top of it. $reserved_fields
		// is empty on a settings screen, which has no post and so nothing to
		// confuse, so this never fires there.
		if ( null !== $repeater_id && $reserved_fields && in_array( $field['id'], self::POST_COLUMN_FIELD_IDS, true ) ) {
			throw new InvalidArgumentException( sprintf(
				'The field "%s" in the repeater "%s" on the "%s" editor screen has the same id as the record\'s own %s, which a row cannot set — a row\'s values are stored inside the row. Choose a different id.',
				$field['id'],
				$repeater_id,
				$slug,
				'post_title' === $field['id'] ? 'title' : 'body'
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
		if ( null !== $repeater_id && ! in_array( $field['kind'], self::REPEATER_KINDS, true ) ) {
			throw new InvalidArgumentException( sprintf(
				'The field "%s" in the repeater "%s" on the "%s" editor screen is a "%s". A repeater row can only hold: %s. Move it out of the repeater, or use one of those.',
				$field['id'],
				$repeater_id,
				$slug,
				$field['kind'],
				implode( ', ', self::REPEATER_KINDS )
			) );
		}
		if ( empty( $field['label'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The field "%s" on the "%s" editor screen needs a label.', $field['id'], $slug ) );
		}
		if ( in_array( $field['kind'], self::CHOICE_KINDS, true ) && empty( $field['options'] ) && 'record' !== $field['kind'] ) {
			throw new InvalidArgumentException( sprintf( 'The field "%s" on the "%s" editor screen is a %s, so it needs options.', $field['id'], $slug, $field['kind'] ) );
		}
		$field['suggestions'] = self::suggestions( $field, $slug );

		// A gantt numbers its phases in weeks, and can also show them as dates.
		// It cannot work the dates out on its own — week 1 is whenever the
		// screen's own record says the work starts — so the plugin names the
		// day to count forward from. Empty means the browser counts from today,
		// which is right for a schedule with no start date of its own.
		if ( 'gantt' === $field['kind'] ) {
			$field['origin'] = isset( $field['origin'] ) ? (string) $field['origin'] : '';
		}

		$field['help']        = $field['help'] ?? '';
		$field['required']    = (bool) ( $field['required'] ?? false );
		$field['capability']  = $field['capability'] ?? '';
		$field['locked_help'] = $field['locked_help'] ?? '';
		$field['depends_on']  = $field['depends_on'] ?? null;
		$field['wide']        = (bool) ( $field['wide'] ?? in_array( $field['kind'], [ 'richtext', 'repeater', 'media', 'file', 'table', 'facts', 'gantt', 'title' ], true ) );
		// What Store::read() hands back for this field when it has never
		// been saved. A plugin may declare its own; otherwise it follows the
		// kind, so a never-touched toggle reads false and a never-touched
		// list reads [] rather than every kind sharing the single '' a bare
		// unset value would otherwise be.
		if ( array_key_exists( 'default', $field ) ) {
			if ( ! self::defaultMatchesKind( $field['default'], $field['kind'] ) ) {
				throw new InvalidArgumentException( sprintf(
					'The field "%s" on the "%s" editor screen declares a default that is not %s, which a "%s" field needs.',
					$field['id'],
					$slug,
					self::defaultTypeLabel( $field['kind'] ),
					$field['kind']
				) );
			}
		} else {
			$field['default'] = self::defaultForKind( $field );
		}

		if ( null === $repeater_id && 'repeater' === $field['kind'] ) {
			if ( empty( $field['fields'] ) ) {
				throw new InvalidArgumentException( sprintf( 'The repeater "%s" on the "%s" editor screen needs at least one sub-field.', $field['id'], $slug ) );
			}
			if ( ! is_array( $field['fields'] ) ) {
				throw new InvalidArgumentException( sprintf( 'The repeater "%s" on the "%s" editor screen has sub-fields that are not a list. Give it a list of sub-fields, each one an array.', $field['id'], $slug ) );
			}
			$sub_seen = [];
			foreach ( $field['fields'] as $sf => $sub_field ) {
				if ( ! is_array( $sub_field ) ) {
					throw new InvalidArgumentException( sprintf( 'The repeater "%s" on the "%s" editor screen has a sub-field that is not an array. Every sub-field is an array with an id, a kind and a label.', $field['id'], $slug ) );
				}
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
