<?php
namespace Blueworx\PageEditor\v1;

/**
 * What this user may see and write. The two directions genuinely differ:
 *
 * - outbound (the schema, and a locked field's value on load): a locked
 *   field stays visible, read-only, with locked_help as its help — a
 *   read-only field with nothing in it is useless.
 * - inbound (a value on the way back in on save): a locked field's value is
 *   dropped, even though the field itself was shown — it must never be
 *   writable.
 *
 * Reads capability and locked_help with ?? '' rather than direct array access:
 * a hand-built screen (never passed through Schema::validate()) may not have
 * either key set.
 */
final class Capabilities {

	public static function filterSchema( array $screen ): array {
		foreach ( $screen['tabs'] as $t => $tab ) {
			foreach ( $tab['panels'] as $p => $panel ) {
				$kept = [];
				foreach ( $panel['fields'] as $field ) {
					if ( self::may( $field ) ) {
						$kept[] = $field;
						continue;
					}
					// Where knowing the field exists matters, it is sent locked
					// with a line naming who can change it — never editable.
					$locked_help = $field['locked_help'] ?? '';
					if ( '' !== $locked_help ) {
						$field['readonly'] = true;
						$field['help']     = $locked_help;
						$kept[]            = $field;
					}
				}
				$screen['tabs'][ $t ]['panels'][ $p ]['fields'] = array_values( $kept );
			}
		}
		return $screen;
	}

	/** @return string[] */
	public static function allowed( array $screen ): array {
		$ids = [];
		foreach ( $screen['tabs'] as $tab ) {
			foreach ( $tab['panels'] as $panel ) {
				foreach ( $panel['fields'] as $field ) {
					if ( self::may( $field ) ) {
						$ids[] = $field['id'];
					}
				}
			}
		}
		return $ids;
	}

	public static function filterValues( array $screen, array $values ): array {
		$allowed = array_flip( self::allowed( $screen ) );
		return array_intersect_key( $values, $allowed );
	}

	/**
	 * Every field id kept by filterSchema() — writable, or locked but shown.
	 * This is the outbound list: a locked field's value belongs on the
	 * screen even though the field itself is not writable.
	 *
	 * @return string[]
	 */
	public static function visible( array $screen ): array {
		$ids = [];
		foreach ( $screen['tabs'] as $tab ) {
			foreach ( $tab['panels'] as $panel ) {
				foreach ( $panel['fields'] as $field ) {
					if ( self::may( $field ) || '' !== ( $field['locked_help'] ?? '' ) ) {
						$ids[] = $field['id'];
					}
				}
			}
		}
		return $ids;
	}

	/**
	 * The outbound counterpart to filterValues(): a locked field's value is
	 * included, because the field is shown read-only rather than hidden.
	 * save() still uses filterValues(), never this, so a locked field's
	 * value can never be written even though it can be seen.
	 */
	public static function filterValuesForDisplay( array $screen, array $values ): array {
		$visible = array_flip( self::visible( $screen ) );
		return array_intersect_key( $values, $visible );
	}

	private static function may( array $field ): bool {
		$capability = $field['capability'] ?? '';
		return '' === $capability || current_user_can( $capability );
	}
}
