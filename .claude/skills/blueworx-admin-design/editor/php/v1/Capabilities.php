<?php
namespace Blueworx\PageEditor\v1;

/**
 * What this user may see and write. Filtering happens on the way out as well as
 * in: a field the browser never receives cannot be re-enabled by editing the
 * page, and a value for it is dropped rather than trusted.
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

	private static function may( array $field ): bool {
		$capability = $field['capability'] ?? '';
		return '' === $capability || current_user_can( $capability );
	}
}
