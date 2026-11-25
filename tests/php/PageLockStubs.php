<?php
/**
 * The few WordPress functions the page lock calls that the page editor's
 * stubs do not already cover. Same approach: each reads from a global the
 * test sets, so a test says what the world looks like.
 *
 *   $GLOBALS['bwpe_stub']['filters'][ hook ] — what apply_filters() returns
 *   $GLOBALS['bwpl_removed']                — hooks removed, as "hook|callback"
 *   $GLOBALS['bwpl_blocks']                 — registered block names
 */

$GLOBALS['bwpl_removed'] = [];
$GLOBALS['bwpl_blocks']  = [];

if ( ! function_exists( 'apply_filters' ) ) {
	function apply_filters( $hook, $value, ...$args ) {
		$filters = $GLOBALS['bwpe_stub']['filters'] ?? [];
		return array_key_exists( $hook, $filters ) ? $filters[ $hook ] : $value;
	}
}
if ( ! function_exists( 'add_action' ) ) {
	function add_action( $hook, $callback, $priority = 10, $args = 1 ) {
		return true;
	}
}
if ( ! function_exists( 'remove_filter' ) ) {
	function remove_filter( $hook, $callback, $priority = 10 ) {
		$GLOBALS['bwpl_removed'][] = $hook . '|' . ( is_string( $callback ) ? $callback : 'closure' );
		return true;
	}
}
if ( ! function_exists( 'remove_action' ) ) {
	function remove_action( $hook, $callback, $priority = 10 ) {
		return remove_filter( $hook, $callback, $priority );
	}
}
if ( ! function_exists( 'get_post_type' ) ) {
	function get_post_type( $id ) {
		return $GLOBALS['bwpe_stub']['posts'][ $id ]['post_type'] ?? false;
	}
}
if ( ! function_exists( 'wp_slash' ) ) {
	function wp_slash( $value ) {
		return addslashes( (string) $value );
	}
}
if ( ! function_exists( 'wp_unslash' ) ) {
	function wp_unslash( $value ) {
		return stripslashes( (string) $value );
	}
}
if ( ! function_exists( 'wpautop' ) ) {
	// The part that matters here: loose words become paragraphs.
	function wpautop( $text ) {
		$out = '';
		foreach ( preg_split( '#(<(?:p|div|h2)\b.*</(?:p|div|h2)>)|\n\s*\n#sU', (string) $text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE ) as $piece ) {
			$loose = '' !== trim( $piece ) && ! preg_match( '#^\s*</?(?:p|div|h2)\b#', $piece );
			$out  .= $loose ? '<p>' . trim( $piece ) . '</p>' : $piece;
		}
		return $out;
	}
}
if ( ! class_exists( 'WP_Block_Type_Registry' ) ) {
	class WP_Block_Type_Registry {
		public static function get_instance() {
			return new self();
		}
		public function get_all_registered() {
			return array_fill_keys( $GLOBALS['bwpl_blocks'], true );
		}
	}
}
