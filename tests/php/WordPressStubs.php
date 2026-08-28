<?php
/**
 * The WordPress functions the page editor library calls, stubbed so its logic
 * can be tested without an install. Each stub reads from a global the test sets,
 * so a test says what the world looks like rather than mocking a call.
 */

$GLOBALS['bwpe_stub'] = [
	'post_types'   => [],
	'capabilities' => [],
	'edit_posts'   => [],
	'meta'         => [],
	'options'      => [],
	'posts'        => [],
	'terms'        => [],
	'thumbnails'   => [],
	'fail_writes'  => false,
	'fail_key'     => null,
];

function bwpe_stub_reset(): void {
	$GLOBALS['bwpe_stub'] = [
		'post_types'   => [],
		'capabilities' => [],
		'edit_posts'   => [],
		'meta'         => [],
		'options'      => [],
		'posts'        => [],
		'terms'        => [],
		'thumbnails'   => [],
		'fail_writes'  => false,
		'fail_key'     => null,
	];
}

if ( ! class_exists( 'WP_Error' ) ) {
	class WP_Error {
		public $errors = [];
		public function __construct( $code = '', $message = '' ) {
			if ( $code ) {
				$this->errors[ $code ][] = $message;
			}
		}
	}
}
if ( ! function_exists( 'is_wp_error' ) ) {
	function is_wp_error( $thing ) {
		return $thing instanceof WP_Error;
	}
}

if ( ! function_exists( 'post_type_exists' ) ) {
	function post_type_exists( $type ) {
		return in_array( $type, $GLOBALS['bwpe_stub']['post_types'], true );
	}
}
if ( ! function_exists( 'current_user_can' ) ) {
	// Real WordPress takes a second argument for a per-object capability —
	// current_user_can( 'edit_post', $id ) asks about that specific post,
	// respecting its post type's own capability mapping, not just whether the
	// screen capability is held. 'edit_posts' answers per id; an id with no
	// entry defaults to allowed, so every test that never mentions it keeps
	// behaving as it did before this existed.
	function current_user_can( $cap, ...$args ) {
		if ( 'edit_post' === $cap && isset( $args[0] ) ) {
			$id = (int) $args[0];
			return array_key_exists( $id, $GLOBALS['bwpe_stub']['edit_posts'] )
				? (bool) $GLOBALS['bwpe_stub']['edit_posts'][ $id ]
				: true;
		}
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
if ( ! function_exists( 'sanitize_title' ) ) {
	// What WordPress itself makes a post slug with (sanitize_title_with_dashes):
	// lowercase, punctuation dropped, every run of whitespace or underscore
	// turned into a single dash, and no dash left at either end. Unlike
	// sanitize_key() it keeps word boundaries, which is the whole difference
	// between "under-12s-team" and "under12steam".
	function sanitize_title( $value, $fallback = '', $context = 'save' ) {
		$value = strtolower( strip_tags( (string) $value ) );
		$value = preg_replace( '/[^a-z0-9\s\-_]/', '', $value );
		$value = preg_replace( '/[\s_]+/', '-', $value );
		$value = preg_replace( '/-+/', '-', $value );
		$value = trim( $value, '-' );
		return '' === $value ? (string) $fallback : $value;
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
if ( ! function_exists( '_doing_it_wrong' ) ) {
	// Real WordPress raises a PHP notice with a backtrace when WP_DEBUG is on,
	// and says nothing otherwise. Nothing here asserts on it, so the stub only
	// needs to exist.
	function _doing_it_wrong( $function, $message, $version ) {}
}
if ( ! function_exists( '__' ) ) {
	function __( $text, $domain = null ) { return $text; }
}
if ( ! function_exists( 'bwpe_stub_cast_meta_value' ) ) {
	/**
	 * What the wpdb layer does to a value on its way into a text column: a
	 * scalar is cast to string (true -> '1', false -> '', an int -> its
	 * digits) because the column is text and only ever holds text; an array
	 * is left alone, because it went through maybe_serialize()/serialize()
	 * first, and unserialize() hands back the original structure — including
	 * every scalar type nested inside it — exactly as it went in. Shared by
	 * the meta and option stubs below, since both go through the same
	 * mechanism in real WordPress.
	 */
	function bwpe_stub_cast_meta_value( $value ) {
		if ( is_array( $value ) ) {
			return $value;
		}
		if ( is_bool( $value ) ) {
			return $value ? '1' : '';
		}
		if ( null === $value ) {
			return '';
		}
		return (string) $value;
	}
}
if ( ! function_exists( 'get_post_meta' ) ) {
	function get_post_meta( $id, $key, $single = false ) {
		$value = $GLOBALS['bwpe_stub']['meta'][ $id ][ $key ] ?? '';
		return $single ? $value : ( '' === $value ? [] : [ $value ] );
	}
}
if ( ! function_exists( 'metadata_exists' ) ) {
	// get_post_meta() answers '' both for a key that was never written and
	// for one genuinely saved empty — it cannot tell those apart. This is
	// the function that can: it looks at whether the row exists at all,
	// never at what it holds.
	function metadata_exists( $meta_type, $id, $key ) {
		return array_key_exists( $key, $GLOBALS['bwpe_stub']['meta'][ $id ] ?? [] );
	}
}
if ( ! function_exists( 'update_post_meta' ) ) {
	function update_post_meta( $id, $key, $value ) {
		if ( $GLOBALS['bwpe_stub']['fail_writes'] ) {
			return false;
		}
		// fail_key fails one named write rather than every write, so a test can
		// prove a loop stopped at the failing key instead of merely proving
		// nothing at all was written. Each stub matches it against whatever it
		// is asked to write: a meta key here, a taxonomy in wp_set_post_terms().
		if ( null !== $GLOBALS['bwpe_stub']['fail_key'] && $key === $GLOBALS['bwpe_stub']['fail_key'] ) {
			return false;
		}
		$cast = bwpe_stub_cast_meta_value( $value );
		// Real WordPress returns false both on a genuine failure and whenever
		// the new value is identical to the one already stored — the stub has
		// to reproduce that quirk, or a bug that only shows up on a no-op
		// re-save could never be caught here. The comparison is against the
		// cast form, because that is what "already stored" means: the row
		// only ever holds the cast form, never the PHP-typed value that was
		// passed in.
		//
		// That no-op check only applies once the row already exists: a key
		// that has never been written has no "already stored" value to match
		// against, and real WordPress always inserts a brand new row
		// regardless of what it holds. Comparing against the '' a missing
		// key defaults to would treat "never saved" and "saved as empty" as
		// the same thing, and silently skip writing the very first false or
		// empty value a field is ever given.
		$existed = array_key_exists( $key, $GLOBALS['bwpe_stub']['meta'][ $id ] ?? [] );
		if ( $existed && $GLOBALS['bwpe_stub']['meta'][ $id ][ $key ] === $cast ) {
			return false;
		}
		$GLOBALS['bwpe_stub']['meta'][ $id ][ $key ] = $cast;
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
		$cast = bwpe_stub_cast_meta_value( $value );
		// Same no-op-returns-false quirk as update_post_meta(), same reason
		// the comparison is against the cast form.
		$current = $GLOBALS['bwpe_stub']['options'][ $name ] ?? false;
		if ( $current === $cast ) {
			return false;
		}
		$GLOBALS['bwpe_stub']['options'][ $name ] = $cast;
		return true;
	}
}
if ( ! function_exists( 'get_post' ) ) {
	function get_post( $id ) {
		if ( ! isset( $GLOBALS['bwpe_stub']['posts'][ $id ] ) ) {
			return null;
		}
		$post = $GLOBALS['bwpe_stub']['posts'][ $id ];
		// A real WP_Post is built straight from the database row: every
		// column comes back as whatever the db driver hands over, which for
		// a numeric column is a numeric string, not an int — only ID gets
		// cast. A test setting post_author/post_parent/menu_order as a bare
		// PHP int would otherwise let Store read one back unchanged and
		// never notice it was never actually cast on the way out.
		foreach ( [ 'post_author', 'post_parent', 'menu_order' ] as $numeric_column ) {
			if ( array_key_exists( $numeric_column, $post ) ) {
				$post[ $numeric_column ] = (string) $post[ $numeric_column ];
			}
		}
		return (object) $post;
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
		$named = null !== $GLOBALS['bwpe_stub']['fail_key'] && $taxonomy === $GLOBALS['bwpe_stub']['fail_key'];
		if ( $GLOBALS['bwpe_stub']['fail_writes'] || $named ) {
			// Real WordPress returns a WP_Error here, not false, on a genuine
			// failure — the stub has to reproduce that or code that only
			// checks `false === $result` could never be caught failing to
			// notice one.
			return new WP_Error( 'invalid_taxonomy', 'Invalid taxonomy.' );
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
		// Real set_post_thumbnail() just calls update_post_meta() under the
		// hood, so it has the exact same no-op-returns-false quirk.
		$thumbnail_id = (int) $thumbnail_id;
		if ( ( $GLOBALS['bwpe_stub']['thumbnails'][ $id ] ?? 0 ) === $thumbnail_id ) {
			return false;
		}
		$GLOBALS['bwpe_stub']['thumbnails'][ $id ] = $thumbnail_id;
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
		// Real WordPress returns 0, not false, for an existing post with no
		// thumbnail — false only when the post itself does not exist. This
		// stub returns false whenever no thumbnail is set, which is stricter
		// than reality: it exercises Store::read()'s cast harder than
		// production ever will, since production never even needs one for
		// the 0 case. That is deliberately safe, not a claim about what
		// WordPress itself returns.
		return $GLOBALS['bwpe_stub']['thumbnails'][ $id ] ?? false;
	}
}
