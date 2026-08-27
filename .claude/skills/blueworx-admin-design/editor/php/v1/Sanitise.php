<?php
namespace Blueworx\PageEditor\v1;

/**
 * Every value is cleaned by what its field is, not by what the browser said it
 * was. A kind with no case here is treated as text, which is the safe end of
 * the range rather than a hole.
 */
final class Sanitise {

	public static function values( array $screen, array $values ): array {
		$out = [];
		foreach ( self::fields( $screen ) as $field ) {
			if ( array_key_exists( $field['id'], $values ) ) {
				$out[ $field['id'] ] = self::field( $field, $values[ $field['id'] ] );
			}
		}
		return $out;
	}

	/** @return array[] */
	public static function fields( array $screen ): array {
		$out = [];
		foreach ( $screen['tabs'] as $tab ) {
			foreach ( $tab['panels'] as $panel ) {
				foreach ( $panel['fields'] as $field ) {
					$out[] = $field;
				}
			}
		}
		return $out;
	}

	public static function field( array $field, $value ) {
		switch ( $field['kind'] ?? 'text' ) {
			case 'richtext':
				return wp_kses_post( (string) $value );

			case 'textarea':
				return implode( "\n", array_map( 'sanitize_text_field', explode( "\n", (string) $value ) ) );

			case 'number':
			case 'range':
				$n = (int) $value;
				if ( isset( $field['min'] ) ) {
					$n = max( (int) $field['min'], $n );
				}
				if ( isset( $field['max'] ) ) {
					$n = min( (int) $field['max'], $n );
				}
				return $n;

			case 'toggle':
				return (bool) $value;

			case 'colour':
				return preg_match( '/^#[0-9a-fA-F]{6}$/', (string) $value ) ? (string) $value : '';

			case 'date':
				return preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $value ) ? (string) $value : '';

			case 'datetime':
				return preg_match( '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', (string) $value ) ? (string) $value : '';

			case 'media':
			case 'file':
			case 'record':
				return (int) $value;

			case 'slug':
				return sanitize_key( (string) $value );

			case 'select':
			case 'radio':
				return self::oneOf( $field, (string) $value );

			case 'checkboxes':
			case 'scrolllist':
				$picked = is_array( $value ) ? $value : [];
				$out    = [];
				foreach ( $picked as $one ) {
					$kept = self::oneOf( $field, (string) $one );
					if ( '' !== $kept ) {
						$out[] = $kept;
					}
				}
				return array_values( array_unique( $out ) );

			case 'tokens':
				$given = is_array( $value ) ? $value : [];
				$out   = [];
				foreach ( $given as $one ) {
					$clean = sanitize_text_field( (string) $one );
					if ( '' !== $clean ) {
						$out[] = $clean;
					}
				}
				return array_values( array_unique( $out ) );

			case 'repeater':
				$rows = is_array( $value ) ? $value : [];
				$out  = [];
				foreach ( $rows as $row ) {
					if ( ! is_array( $row ) ) {
						continue;
					}
					$clean = [];
					foreach ( $field['fields'] as $cell ) {
						$clean[ $cell['id'] ] = self::field( $cell, $row[ $cell['id'] ] ?? '' );
					}
					$out[] = $clean;
				}
				return $out;

			// facts and table are read-only on the screen; nothing comes back.
			case 'facts':
			case 'table':
				return null;

			default:
				return sanitize_text_field( (string) $value );
		}
	}

	private static function oneOf( array $field, string $value ): string {
		foreach ( $field['options'] ?? [] as $option ) {
			if ( (string) $option['value'] === $value ) {
				return $value;
			}
		}
		return '';
	}
}
