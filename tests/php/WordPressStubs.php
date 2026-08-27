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
	'posts'        => [],
	'terms'        => [],
	'thumbnails'   => [],
	'fail_writes'  => false,
];

function bwpe_stub_reset(): void {
	$GLOBALS['bwpe_stub'] = [
		'post_types'   => [],
		'capabilities' => [],
		'meta'         => [],
		'options'      => [],
		'posts'        => [],
		'terms'        => [],
		'thumbnails'   => [],
		'fail_writes'  => false,
	];
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
		$value = strip_tags( (string) $value, '<p><br><strong><em><a><ul><ol><li><img>' );
		// Real wp_kses_post filters attributes, not just tags. The stub has to
		// do the same or a test asserting "this was stripped" passes against a
		// stub that never stripped it.
		$value = preg_replace( '/\s+on[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $value );
		$value = preg_replace( '/\s+(href|src)\s*=\s*("|\')?\s*javascript:[^"\'\s>]*("|\')?/i', '', $value );
		return $value;
	}
}
if ( ! function_exists( '__' ) ) {
	function __( $text, $domain = null ) { return $text; }
}
if ( ! function_exists( 'get_post_meta' ) ) {
	function get_post_meta( $id, $key, $single = false ) {
		$value = $GLOBALS['bwpe_stub']['meta'][ $id ][ $key ] ?? '';
		return $single ? $value : ( '' === $value ? [] : [ $value ] );
	}
}
if ( ! function_exists( 'update_post_meta' ) ) {
	function update_post_meta( $id, $key, $value ) {
		if ( $GLOBALS['bwpe_stub']['fail_writes'] ) {
			return false;
		}
		// Real WordPress returns false both on a genuine failure and whenever
		// the new value is identical to the one already stored — the stub has
		// to reproduce that quirk, or a bug that only shows up on a no-op
		// re-save could never be caught here.
		$current = $GLOBALS['bwpe_stub']['meta'][ $id ][ $key ] ?? '';
		if ( $current === $value ) {
			return false;
		}
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
		if ( $GLOBALS['bwpe_stub']['fail_writes'] ) {
			return false;
		}
		// Same no-op-returns-false quirk as update_post_meta().
		$current = $GLOBALS['bwpe_stub']['options'][ $name ] ?? false;
		if ( $current === $value ) {
			return false;
		}
		$GLOBALS['bwpe_stub']['options'][ $name ] = $value;
		return true;
	}
}
if ( ! function_exists( 'get_post' ) ) {
	function get_post( $id ) {
		if ( ! isset( $GLOBALS['bwpe_stub']['posts'][ $id ] ) ) {
			return null;
		}
		return (object) $GLOBALS['bwpe_stub']['posts'][ $id ];
	}
}
if ( ! function_exists( 'wp_update_post' ) ) {
	function wp_update_post( $postarr ) {
		if ( $GLOBALS['bwpe_stub']['fail_writes'] ) {
			return 0;
		}
		$id       = (int) ( $postarr['ID'] ?? 0 );
		$existing = $GLOBALS['bwpe_stub']['posts'][ $id ] ?? [];
		$GLOBALS['bwpe_stub']['posts'][ $id ] = array_merge( $existing, $postarr );
		return $id;
	}
}
if ( ! function_exists( 'wp_set_post_terms' ) ) {
	function wp_set_post_terms( $id, $terms, $taxonomy ) {
		if ( $GLOBALS['bwpe_stub']['fail_writes'] ) {
			return false;
		}
		$GLOBALS['bwpe_stub']['terms'][ $id ][ $taxonomy ] = $terms;
		return $terms;
	}
}
if ( ! function_exists( 'wp_get_post_terms' ) ) {
	function wp_get_post_terms( $id, $taxonomy, $args = [] ) {
		return $GLOBALS['bwpe_stub']['terms'][ $id ][ $taxonomy ] ?? [];
	}
}
if ( ! function_exists( 'set_post_thumbnail' ) ) {
	function set_post_thumbnail( $id, $thumbnail_id ) {
		if ( $GLOBALS['bwpe_stub']['fail_writes'] ) {
			return false;
		}
		$GLOBALS['bwpe_stub']['thumbnails'][ $id ] = (int) $thumbnail_id;
		return true;
	}
}
if ( ! function_exists( 'delete_post_thumbnail' ) ) {
	function delete_post_thumbnail( $id ) {
		unset( $GLOBALS['bwpe_stub']['thumbnails'][ $id ] );
		return true;
	}
}
if ( ! function_exists( 'get_post_thumbnail_id' ) ) {
	function get_post_thumbnail_id( $id ) {
		return $GLOBALS['bwpe_stub']['thumbnails'][ $id ] ?? 0;
	}
}
