<?php
/**
 * The few WordPress functions the page lock calls that the page editor's
 * stubs do not already cover. Same approach: each reads from a global the
 * test sets, so a test says what the world looks like.
 *
 *   $GLOBALS['bwpe_stub']['filters'][ hook ] — what apply_filters() returns
 *   $GLOBALS['bwpl_removed']                — hooks removed, as "hook|callback"
 *   $GLOBALS['bwpl_blocks']                 — registered block names
 *   $GLOBALS['bwpl_revisions']              — the page's revisions, id => post
 */

$GLOBALS['bwpl_removed'] = [];
$GLOBALS['bwpl_blocks']  = [];
$GLOBALS['bwpl_revisions'] = [];

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
	// The parts that matter here: loose words become paragraphs, and two line
	// breaks or an empty line end one.
	function wpautop( $text ) {
		$text = preg_replace( '#<br\s*/?>\s*<br\s*/?>#', "\n\n", (string) $text );
		$out  = '';
		foreach ( preg_split( '#(<p\b.*</p>|<(?:div|h2)\b.*</(?:div|h2)>|<hr>)|\n\s*\n#sU', $text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE ) as $piece ) {
			$loose = '' !== trim( $piece ) && ! preg_match( '#^\s*</?(?:p|div|h2|hr)\b#', $piece );
			$piece = preg_replace( '#\n\s*\n#', '</p><p>', $piece );
			$out  .= $loose ? '<p>' . trim( $piece ) . '</p>' : $piece;
		}
		return preg_replace( '#<p>\s*</p>#', '', $out );
	}
}
if ( ! function_exists( 'wp_get_post_revisions' ) ) {
	function wp_get_post_revisions( $post, $args = [] ) {
		return $GLOBALS['bwpl_revisions'];
	}
}
if ( ! function_exists( 'wp_get_post_revision' ) ) {
	function wp_get_post_revision( &$id ) {
		return $GLOBALS['bwpl_revisions'][ $id ] ?? null;
	}
}
if ( ! function_exists( 'wp_is_post_autosave' ) ) {
	function wp_is_post_autosave( $post ) {
		return false !== strpos( $post->post_name, '-autosave' );
	}
}
if ( ! function_exists( 'esc_html' ) ) {
	function esc_html( $text ) {
		return htmlspecialchars( $text );
	}
}
if ( ! function_exists( 'wp_die' ) ) {
	function wp_die( $message ) {
		throw new \RuntimeException( $message );
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
