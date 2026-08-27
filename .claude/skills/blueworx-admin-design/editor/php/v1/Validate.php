<?php
namespace Blueworx\PageEditor\v1;

use Blueworx\PageEditor\v1\Sanitise;

/**
 * Errors are keyed by field id so the screen can put each message under the
 * field it belongs to. Every message names the fix — "Invalid input" tells a
 * site owner nothing they can act on.
 */
final class Validate {

	/** @return array<string,string> */
	public static function run( array $screen, array $values ): array {
		$errors = [];

		foreach ( Sanitise::fields( $screen ) as $field ) {
			$value = $values[ $field['id'] ] ?? '';

			if ( ! self::applies( $field, $values ) ) {
				continue;
			}

			if ( $field['required'] && self::isEmpty( $value ) ) {
				$errors[ $field['id'] ] = sprintf( '%s needs a value before this can be saved.', $field['label'] );
				continue;
			}
			if ( self::isEmpty( $value ) ) {
				continue;
			}

			if ( 'email' === ( $field['format'] ?? '' ) && '' === sanitize_email( (string) $value ) ) {
				$errors[ $field['id'] ] = 'That is not a valid address. It needs a domain, like dan@coastalbloom.co.';
				continue;
			}
			if ( 'url' === ( $field['format'] ?? '' ) && '' === esc_url_raw( (string) $value ) ) {
				$errors[ $field['id'] ] = 'That is not a valid address. It needs to start with https://.';
				continue;
			}
			if ( isset( $field['max_length'] ) && strlen( (string) $value ) > (int) $field['max_length'] ) {
				$errors[ $field['id'] ] = sprintf( 'Keep this to %d characters or fewer.', (int) $field['max_length'] );
				continue;
			}
		}

		if ( isset( $screen['validate'] ) && is_callable( $screen['validate'] ) ) {
			$extra = call_user_func( $screen['validate'], $values );
			if ( is_array( $extra ) ) {
				$errors = array_merge( $errors, $extra );
			}
		}

		return $errors;
	}

	/**
	 * A field that only exists while its condition holds is not validated when
	 * the condition is false — it is not on the screen, so it cannot be wrong.
	 */
	private static function applies( array $field, array $values ): bool {
		if ( empty( $field['depends_on'] ) ) {
			return true;
		}
		$on = $field['depends_on'];
		return ( $values[ $on['field'] ] ?? null ) == $on['value']; // phpcs:ignore WordPress.PHP.StrictComparisons.LooseComparison -- a checkbox sends "1" for the boolean true a schema declares.
	}

	private static function isEmpty( $value ): bool {
		if ( is_array( $value ) ) {
			return 0 === count( $value );
		}
		return '' === trim( (string) $value );
	}
}
