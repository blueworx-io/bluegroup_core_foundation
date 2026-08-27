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
		foreach ( $screen['tabs'] as $t => $tab ) {
			$screen['tabs'][ $t ] = self::tab( $tab, $screen['slug'], $seen, $tab_ids, $panel_ids, $dependencies, $repeater_scopes );
		}

		self::checkDependencies( $screen['slug'], $seen, $repeater_scopes, $dependencies );

		return $screen;
	}

	private static function tab( array $tab, string $slug, array &$seen, array &$tab_ids, array &$panel_ids, array &$dependencies, array &$repeater_scopes ): array {
		if ( empty( $tab['id'] ) || empty( $tab['label'] ) ) {
			throw new InvalidArgumentException( sprintf( 'Every tab on the "%s" editor screen needs an id and a label.', $slug ) );
		}
		if ( isset( $tab_ids[ $tab['id'] ] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen uses the tab id "%s" twice. Tab ids must be unique across the whole screen.', $slug, $tab['id'] ) );
		}
		$tab_ids[ $tab['id'] ] = true;

		$tab['panels'] = $tab['panels'] ?? [];
		foreach ( $tab['panels'] as $p => $panel ) {
			$tab['panels'][ $p ] = self::panel( $panel, $slug, $seen, $panel_ids, $dependencies, $repeater_scopes );
		}
		return $tab;
	}

	private static function panel( array $panel, string $slug, array &$seen, array &$panel_ids, array &$dependencies, array &$repeater_scopes ): array {
		if ( empty( $panel['id'] ) || empty( $panel['title'] ) ) {
			throw new InvalidArgumentException( sprintf( 'Every panel on the "%s" editor screen needs an id and a title.', $slug ) );
		}
		if ( isset( $panel_ids[ $panel['id'] ] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen uses the panel id "%s" twice. Panel ids must be unique across the whole screen.', $slug, $panel['id'] ) );
		}
		$panel_ids[ $panel['id'] ] = true;

		$panel['eyebrow']  = $panel['eyebrow'] ?? '';
		$panel['note']     = $panel['note'] ?? '';
		$panel['hideable'] = (bool) ( $panel['hideable'] ?? false );
		$panel['fields']   = $panel['fields'] ?? [];
		foreach ( $panel['fields'] as $f => $field ) {
			$panel['fields'][ $f ] = self::field( $field, $slug, $seen, null, $dependencies, $repeater_scopes );
		}
		return $panel;
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
	private static function field( array $field, string $slug, array &$seen, ?string $repeater_id, array &$dependencies, array &$repeater_scopes ): array {
		if ( empty( $field['id'] ) ) {
			throw new InvalidArgumentException( sprintf( 'Every field on the "%s" editor screen needs an id.', $slug ) );
		}
		if ( isset( $seen[ $field['id'] ] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen uses the field id "%s" twice. Every field id is saved as its own value, so they must be unique across the whole screen.', $slug, $field['id'] ) );
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

		if ( null === $repeater_id && 'repeater' === $field['kind'] ) {
			if ( empty( $field['fields'] ) ) {
				throw new InvalidArgumentException( sprintf( 'The repeater "%s" on the "%s" editor screen needs at least one sub-field.', $field['id'], $slug ) );
			}
			$sub_seen = [];
			foreach ( $field['fields'] as $sf => $sub_field ) {
				$field['fields'][ $sf ] = self::field( $sub_field, $slug, $sub_seen, $field['id'], $dependencies, $repeater_scopes );
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
