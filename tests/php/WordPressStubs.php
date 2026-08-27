<?php
/**
 * The WordPress functions the page editor library calls, stubbed so its logic
 * can be tested without an install. Each stub reads from a global the test sets,
 * so a test says what the world looks like rather than mocking a call.
 */

$GLOBALS['bwpe_stub'] = [
	'post_types'   => [],
	'capabilities' => [],
	'meta'         => [],
	'options'      => [],
];

function bwpe_stub_reset(): void {
	$GLOBALS['bwpe_stub'] = [ 'post_types' => [], 'capabilities' => [], 'meta' => [], 'options' => [] ];
}

if ( ! function_exists( 'post_type_exists' ) ) {
	function post_type_exists( $type ) {
		return in_array( $type, $GLOBALS['bwpe_stub']['post_types'], true );
	}
}
if ( ! function_exists( 'current_user_can' ) ) {
	function current_user_can( $cap ) {
		return in_array( $cap, $GLOBALS['bwpe_stub']['capabilities'], true );
	}
}
if ( ! function_exists( 'sanitize_text_field' ) ) {
	function sanitize_text_field( $value ) {
		return trim( preg_replace( '/[\r\n\t]+|<[^>]*>/', '', (string) $value ) );
	}
}
if ( ! function_exists( 'sanitize_key' ) ) {
	function sanitize_key( $value ) {
		return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $value ) );
	}
}
if ( ! function_exists( 'esc_url_raw' ) ) {
	function esc_url_raw( $value ) {
		return filter_var( (string) $value, FILTER_VALIDATE_URL ) ? (string) $value : '';
	}
}
if ( ! function_exists( 'sanitize_email' ) ) {
	function sanitize_email( $value ) {
		return filter_var( (string) $value, FILTER_VALIDATE_EMAIL ) ? (string) $value : '';
	}
}
if ( ! function_exists( 'wp_kses_post' ) ) {
	function wp_kses_post( $value ) {
		return strip_tags( (string) $value, '<p><br><strong><em><a><ul><ol><li><img>' );
	}
}
if ( ! function_exists( '__' ) ) {
	function __( $text, $domain = null ) { return $text; }
}
if ( ! function_exists( 'get_post_meta' ) ) {
	function get_post_meta( $id, $key, $single = false ) {
		return $GLOBALS['bwpe_stub']['meta'][ $id ][ $key ] ?? '';
	}
}
if ( ! function_exists( 'update_post_meta' ) ) {
	function update_post_meta( $id, $key, $value ) {
		$GLOBALS['bwpe_stub']['meta'][ $id ][ $key ] = $value;
		return true;
	}
}
if ( ! function_exists( 'get_option' ) ) {
	function get_option( $name, $default = false ) {
		return $GLOBALS['bwpe_stub']['options'][ $name ] ?? $default;
	}
}
if ( ! function_exists( 'update_option' ) ) {
	function update_option( $name, $value ) {
		$GLOBALS['bwpe_stub']['options'][ $name ] = $value;
		return true;
	}
}
