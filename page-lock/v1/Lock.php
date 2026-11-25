<?php
/**
 * The page lock.
 *
 * Every page is locked from the moment it is created. On a locked page anyone
 * who is not an administrator — a client, or a connected tool such as Claude —
 * can change words, images, links and list items, but cannot add, move or
 * remove a section. Only an administrator can lock or unlock a page.
 *
 * The lock is one post meta flag that only administrators may write. The
 * server checks every save, wherever it came from: the shape of the page
 * (which blocks, in which order, nested how) has to come back exactly as it
 * went out, with each section in its own place and nothing new outside them. A
 * REST save that breaks that is refused with a message; any other write keeps
 * the content the page had.
 *
 * A page with no blocks yet has no shape to keep, so its first layout can be
 * saved once. After that the shape is fixed.
 *
 * In the block editor, someone who may not change a locked page also gets:
 * only the site's own section blocks, no code editor, no add-block button
 * once the page has a layout, and the page structure panel open. That is a
 * courtesy so they are not offered controls that would fail; the server check
 * is the guarantee.
 *
 * @package BlueworxPageLock
 */

namespace Blueworx\PageLock\v1;

/**
 * The lock's hooks and the logic behind them. All static: there is one lock.
 */
final class Lock {

	/** The post meta flag. Kept from the theme's own lock so pages it locked stay locked. */
	const META = '_blueworx_page_lock';

	/** Where a section's id sits, inside the block's metadata. Never stored: see with_ids(). */
	const ID = 'blueworxSection';

	/** Hides the add-block button, which stays on screen, greyed out, when the editor is locked. */
	const NO_ADD_BUTTON = '.editor-document-tools__inserter-toggle,.edit-post-header-toolbar__inserter-toggle{display:none!important}';

	/** A block's opening or closing comment, as WordPress's own parser reads it. */
	const DELIMITER = '/<!--[ \t\f\r\n]+(?P<closer>\/)?wp:(?P<namespace>[a-z][a-z0-9_-]*\/)?(?P<name>[a-z][a-z0-9_-]*)[ \t\f\r\n]+(?P<attrs>{(?:(?:[^}]+|}+(?=})|(?!}[ \t\f\r\n]+\/?-->).)*+)?}[ \t\f\r\n]+)?(?P<void>\/)?-->/s';

	/**
	 * Web address of the copy's folder, for the editor script.
	 *
	 * @var string
	 */
	private static $url = '';

	/**
	 * Version of the running copy.
	 *
	 * @var string
	 */
	private static $version = '1.0.1';

	/**
	 * True while the lock writes its own flag, so its own guard lets it through.
	 *
	 * @var bool
	 */
	private static $writing = false;

	/**
	 * Adds every hook.
	 *
	 * @param string $url     Web address of the copy's folder.
	 * @param string $version Version of the running copy.
	 * @return void
	 */
	public static function boot( $url, $version ) {
		self::$url     = (string) $url;
		self::$version = (string) $version;

		self::retire_theme_lock();

		add_action( 'init', array( self::class, 'register_meta' ) );
		add_action( 'init', array( self::class, 'register_rest_guards' ), 20 );
		add_filter( 'add_post_metadata', array( self::class, 'guard_meta' ), 10, 3 );
		add_filter( 'update_post_metadata', array( self::class, 'guard_meta' ), 10, 3 );
		add_filter( 'delete_post_metadata', array( self::class, 'guard_meta' ), 10, 3 );
		add_filter( 'wp_insert_post_data', array( self::class, 'insert_guard' ), 10, 2 );
		add_action( 'wp_insert_post', array( self::class, 'lock_new_page' ), 10, 3 );
		add_filter( 'block_editor_settings_all', array( self::class, 'editor_settings' ), 10, 2 );
		add_filter( 'allowed_block_types_all', array( self::class, 'allowed_blocks' ), 10, 2 );
		add_filter( 'display_post_states', array( self::class, 'post_state' ), 10, 2 );
		add_action( 'enqueue_block_editor_assets', array( self::class, 'editor_assets' ) );
	}

	/**
	 * Switches off the lock the theme carried before this shared copy existed.
	 *
	 * Until a site's theme is updated to carry this copy, it still runs its own,
	 * and two locks would show two panels. Both read the same flag, so turning
	 * the old one off changes nothing for pages already locked. Remove this once
	 * every theme carries the shared copy.
	 *
	 * @return void
	 */
	public static function retire_theme_lock() {
		if ( ! function_exists( 'blueworx_page_lock_shape' ) ) {
			return;
		}
		remove_action( 'init', 'blueworx_page_lock_register_meta' );
		remove_filter( 'add_post_metadata', 'blueworx_page_lock_guard_meta', 10 );
		remove_filter( 'update_post_metadata', 'blueworx_page_lock_guard_meta', 10 );
		remove_filter( 'delete_post_metadata', 'blueworx_page_lock_guard_meta', 10 );
		remove_filter( 'wp_insert_post_data', 'blueworx_page_lock_insert_guard', 10 );
		remove_filter( 'block_editor_settings_all', 'blueworx_page_lock_editor_settings', 10 );
		remove_filter( 'display_post_states', 'blueworx_page_lock_post_state', 10 );
		remove_action( 'enqueue_block_editor_assets', 'blueworx_page_lock_editor_assets' );
		// The theme adds its REST guard on init, so it can only come off after.
		add_action(
			'init',
			function () {
				foreach ( Lock::post_types() as $type ) {
					remove_filter( 'rest_pre_insert_' . $type, 'blueworx_page_lock_rest_guard', 10 );
				}
			},
			11
		);
	}

	/**
	 * The post types the lock covers. Pages, unless a site adds its own.
	 *
	 * @return string[]
	 */
	public static function post_types() {
		return array_values( (array) apply_filters( 'blueworx_page_lock_post_types', array( 'page' ) ) );
	}

	/**
	 * Whether a post type is covered.
	 *
	 * @param string $type Post type.
	 * @return bool
	 */
	public static function covers( $type ) {
		return in_array( (string) $type, self::post_types(), true );
	}

	/**
	 * Whether the current user may lock and unlock pages: administrators.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return (bool) current_user_can( apply_filters( 'blueworx_page_lock_capability', 'manage_options' ) );
	}

	/**
	 * Whether a post is locked.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function is_locked( $post_id ) {
		return (bool) get_post_meta( (int) $post_id, self::META, true );
	}

	/**
	 * Reads post content into its blocks, the way WordPress's own parser does.
	 *
	 * Each block is [ name, attrs, html, children, at, length ]: its settings as
	 * written, the pieces of markup of its own around its children, and where its
	 * opening comment sits. The page itself comes back as the outermost block, so
	 * its html is whatever is outside every section.
	 *
	 * @param string $content Post content.
	 * @return array
	 */
	private static function read( $content ) {
		$content = (string) $content;
		$root    = self::node( '', '', 0, 0 );
		$stack   = array( &$root );
		$from    = 0;

		preg_match_all( self::DELIMITER, $content, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE );

		foreach ( $matches as $m ) {
			$depth   = count( $stack ) - 1;
			$at      = $m[0][1];
			$length  = strlen( $m[0][0] );
			$closing = '' !== $m['closer'][0];

			// WordPress reads no blocks after a closing comment that closes nothing.
			if ( $closing && 0 === $depth ) {
				break;
			}

			$piece = count( $stack[ $depth ]['html'] ) - 1;

			$stack[ $depth ]['html'][ $piece ] .= substr( $content, $from, $at - $from );

			$from = $at + $length;

			if ( $closing ) {
				array_pop( $stack );
				continue;
			}

			$name  = ( '' === $m['namespace'][0] ? 'core/' : $m['namespace'][0] ) . $m['name'][0];
			$attrs = isset( $m['attrs'] ) ? rtrim( $m['attrs'][0] ) : '';

			$stack[ $depth ]['html'][]     = '';
			$stack[ $depth ]['children'][] = self::node( $name, $attrs, $at, $length );

			if ( empty( $m['void'][0] ) ) {
				$index   = count( $stack[ $depth ]['children'] ) - 1;
				$stack[] = &$stack[ $depth ]['children'][ $index ];
			}
		}

		$last  = count( $stack ) - 1;
		$piece = count( $stack[ $last ]['html'] ) - 1;

		$stack[ $last ]['html'][ $piece ] .= substr( $content, $from );

		return $root;
	}

	/**
	 * An empty block for read() to fill.
	 *
	 * @param string $name   Block name.
	 * @param string $attrs  Settings, as written.
	 * @param int    $at     Where its opening comment starts.
	 * @param int    $length How long that comment is.
	 * @return array
	 */
	private static function node( $name, $attrs, $at, $length ) {
		return array(
			'name'     => $name,
			'attrs'    => $attrs,
			'html'     => array( '' ),
			'children' => array(),
			'at'       => $at,
			'length'   => $length,
		);
	}

	/**
	 * The shape of a block tree: which blocks, in which order, nested how.
	 *
	 * Returns a nested list of [ block name, children ]. Text, markup and
	 * attributes are ignored, because a locked page is still a page somebody may
	 * write on.
	 *
	 * @param string $content Post content.
	 * @return array<int, array{0: string, 1: array}>
	 */
	public static function shape( $content ) {
		return self::outline( self::read( $content ) );
	}

	/**
	 * The shape of one block's children.
	 *
	 * @param array $node Block from read().
	 * @return array<int, array{0: string, 1: array}>
	 */
	private static function outline( $node ) {
		$out = array();
		foreach ( $node['children'] as $child ) {
			$out[] = array( $child['name'], self::outline( $child ) );
		}
		return $out;
	}

	/**
	 * Whether a save from $before to $after must be refused on a locked page.
	 *
	 * A page with no blocks yet may be given its first layout.
	 *
	 * @param string $before Content as saved.
	 * @param string $after  Content being saved.
	 * @return bool
	 */
	public static function refuses( $before, $after ) {
		$was = self::read( $before );
		$now = self::read( $after );
		if ( ! $was['children'] ) {
			return false;
		}
		return self::outline( $now ) !== self::outline( $was )
			|| self::adds_outside( $was, $now )
			|| self::moves( $was, $now, $was, '' );
	}

	/**
	 * Whether there is markup outside the sections where there was none.
	 *
	 * Words an older page already has beside its sections may still be edited.
	 *
	 * @param array $was Page as saved.
	 * @param array $now Page being saved, of the same shape.
	 * @return bool
	 */
	private static function adds_outside( $was, $now ) {
		foreach ( $now['html'] as $i => $html ) {
			if ( '' !== trim( $html ) && '' === trim( $was['html'][ $i ] ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Whether sections of one type have changed places.
	 *
	 * A section that came back with its id has to be where it was. One without
	 * an id, from something that read the page before ids existed or dropped
	 * them, is only known by its words, so it counts as moved when whole sections
	 * have traded places word for word. Any other edit is taken as words.
	 *
	 * @param array  $was  Block as saved.
	 * @param array  $now  Block being saved, of the same shape.
	 * @param array  $page The whole page as saved.
	 * @param string $path Id of the block, '' for the page.
	 * @return bool
	 */
	private static function moves( $was, $now, $page, $path ) {
		$unknown = array();
		foreach ( $now['children'] as $i => $child ) {
			$here = '' === $path ? (string) $i : $path . '.' . $i;
			$id   = self::id_of( $child );
			if ( '' === $id || ! self::has_id( $page, $id ) ) {
				$unknown[ $child['name'] ][] = $i;
			} elseif ( $id !== $here ) {
				return true;
			}
			if ( self::moves( $was['children'][ $i ], $child, $page, $here ) ) {
				return true;
			}
		}
		foreach ( $unknown as $slots ) {
			if ( self::trades_places( $was, $now, $slots ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Whether any of these children have traded places word for word.
	 *
	 * Each changed place is followed back to the place its section came from;
	 * places left once the dead ends are gone form a loop, which is a move. A
	 * section copied over another, or rewritten, always leaves a dead end.
	 *
	 * @param array $was   Block as saved.
	 * @param array $now   Block being saved, of the same shape.
	 * @param int[] $slots Places of the children to compare.
	 * @return bool
	 */
	private static function trades_places( $was, $now, $slots ) {
		$old = array();
		$new = array();
		foreach ( $slots as $i ) {
			$before = self::fingerprint( $was['children'][ $i ] );
			$after  = self::fingerprint( $now['children'][ $i ] );
			if ( $before !== $after ) {
				$old[ $i ] = $before;
				$new[ $i ] = $after;
			}
		}
		do {
			$left = count( $new );
			foreach ( $new as $i => $after ) {
				if ( ! in_array( $after, $old, true ) ) {
					unset( $new[ $i ], $old[ $i ] );
				}
			}
		} while ( count( $new ) < $left );
		return array() !== $new;
	}

	/**
	 * Everything in a block but its id, so two copies of it compare equal.
	 *
	 * @param array $node Block from read().
	 * @return string
	 */
	private static function fingerprint( $node ) {
		$attrs = self::sorted( json_decode( $node['attrs'], true ) );
		if ( isset( $attrs['metadata'] ) && is_array( $attrs['metadata'] ) ) {
			unset( $attrs['metadata'][ self::ID ] );
			if ( ! $attrs['metadata'] ) {
				unset( $attrs['metadata'] );
			}
		}
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize -- compared here and thrown away.
		return serialize(
			array(
				$node['name'],
				$attrs ? $attrs : array(),
				array_map( 'trim', $node['html'] ),
				array_map( array( self::class, 'fingerprint' ), $node['children'] ),
			)
		);
	}

	/**
	 * Settings with their keys in one order, however they were written.
	 *
	 * @param mixed $value Decoded settings.
	 * @return mixed
	 */
	private static function sorted( $value ) {
		if ( ! is_array( $value ) ) {
			return $value;
		}
		ksort( $value );
		return array_map( array( self::class, 'sorted' ), $value );
	}

	/**
	 * The id a block carries, or ''.
	 *
	 * @param array $node Block from read().
	 * @return string
	 */
	private static function id_of( $node ) {
		$attrs = json_decode( $node['attrs'], true );
		$id    = isset( $attrs['metadata'][ self::ID ] ) && is_array( $attrs['metadata'] ) ? $attrs['metadata'][ self::ID ] : '';
		return is_string( $id ) ? $id : '';
	}

	/**
	 * Whether an id names a block on the page.
	 *
	 * @param array  $page Page as saved.
	 * @param string $id   Id.
	 * @return bool
	 */
	private static function has_id( $page, $id ) {
		foreach ( explode( '.', $id ) as $i ) {
			if ( ! isset( $page['children'][ $i ] ) ) {
				return false;
			}
			$page = $page['children'][ $i ];
		}
		return true;
	}

	/**
	 * Content with an id on every section: where it sits in the saved page.
	 *
	 * Nothing is stored. A locked page's sections never move, so their places are
	 * ids that every page already has, whenever it was saved. They are given out
	 * as the page is read and taken off again as it is saved.
	 *
	 * @param string $content Post content as saved.
	 * @return string
	 */
	public static function with_ids( $content ) {
		$ids = array();
		self::list_ids( self::read( $content ), '', $ids );
		foreach ( array_reverse( $ids, true ) as $id => $node ) {
			$comment = substr( $content, $node['at'], $node['length'] );
			$marked  = self::mark( $node['attrs'], (string) $id );
			if ( '' === $node['attrs'] ) {
				$comment = preg_replace( '#\s+(/?-->)$#', ' ' . $marked . ' $1', $comment );
			} else {
				$comment = str_replace( $node['attrs'], $marked, $comment );
			}
			$content = substr_replace( $content, $comment, $node['at'], $node['length'] );
		}
		return $content;
	}

	/**
	 * Lists every block under a block by its id, in the order they are written.
	 *
	 * @param array  $node Block from read().
	 * @param string $path Id of the block, '' for the page.
	 * @param array  $ids  Filled with id => block.
	 * @return void
	 */
	private static function list_ids( $node, $path, &$ids ) {
		foreach ( $node['children'] as $i => $child ) {
			$id         = '' === $path ? (string) $i : $path . '.' . $i;
			$ids[ $id ] = $child;
			self::list_ids( $child, $id, $ids );
		}
	}

	/**
	 * A block's settings with its id added.
	 *
	 * Written into the text as it stands, so taking the id off again gives back
	 * exactly what was saved.
	 *
	 * @param string $attrs Settings, as written, or ''.
	 * @param string $id    Id.
	 * @return string
	 */
	private static function mark( $attrs, $id ) {
		$mark    = '"metadata":{"' . self::ID . '":"' . $id . '"}';
		$decoded = json_decode( $attrs );
		if ( '' === $attrs || ( is_object( $decoded ) && ! get_object_vars( $decoded ) ) ) {
			return '{' . $mark . '}';
		}
		if ( ! is_object( $decoded ) ) {
			return $attrs;
		}
		if ( ! isset( $decoded->metadata ) ) {
			return substr( $attrs, 0, -1 ) . ',' . $mark . '}';
		}
		if ( ! is_object( $decoded->metadata ) ) {
			return $attrs;
		}
		// The block already has some, such as a name of its own.
		$decoded->metadata->{self::ID} = $id;
		return serialize_block_attributes( $decoded );
	}

	/**
	 * Content with every section's id taken off.
	 *
	 * @param string $content Post content.
	 * @return string
	 */
	public static function without_ids( $content ) {
		$content = (string) $content;
		if ( false === strpos( $content, '"' . self::ID . '"' ) ) {
			return $content;
		}
		$out = preg_replace_callback(
			self::DELIMITER,
			function ( $m ) {
				if ( empty( $m['attrs'] ) ) {
					return $m[0];
				}
				// A quote inside somebody's words is always written escaped, so
				// this only ever matches the id itself.
				$id    = '"' . self::ID . '"\s*:\s*"[^"\\\\]*"';
				$attrs = preg_replace(
					array(
						'#,\s*"metadata"\s*:\s*\{\s*' . $id . '\s*\}#',
						'#"metadata"\s*:\s*\{\s*' . $id . '\s*\}(?:\s*,\s*)?#',
						'#,\s*' . $id . '#',
						'#' . $id . '(?:\s*,\s*)?#',
					),
					'',
					$m['attrs']
				);
				if ( preg_match( '#^\{\s*\}\s*$#', $attrs ) ) {
					$attrs = '';
				}
				return str_replace( $m['attrs'], $attrs, $m[0] );
			},
			$content
		);
		return null === $out ? $content : $out;
	}

	/**
	 * Whether a save by the current user must keep this post's shape.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function applies( $post_id ) {
		$post_id = (int) $post_id;
		if ( $post_id <= 0 || ! self::covers( get_post_type( $post_id ) ) ) {
			return false;
		}
		return self::is_locked( $post_id ) && ! self::can_manage();
	}

	/**
	 * Whether a locked page already has its layout, so nothing can be added.
	 *
	 * @param object $post The post.
	 * @return bool
	 */
	public static function frozen( $post ) {
		return self::applies( $post->ID ) && array() !== self::shape( $post->post_content );
	}

	/**
	 * The message given when a save would change a locked page's sections.
	 *
	 * @return string
	 */
	public static function message() {
		return __( 'This page is locked. You can change its words, images and links, but not add, move or remove sections. Ask an administrator to unlock it.', 'blueworx-page-lock' );
	}

	/**
	 * Registers the flag as post meta that only administrators can write.
	 *
	 * @return void
	 */
	public static function register_meta() {
		foreach ( self::post_types() as $type ) {
			register_post_meta(
				$type,
				self::META,
				array(
					'type'          => 'boolean',
					'single'        => true,
					'default'       => false,
					'show_in_rest'  => true,
					'auth_callback' => array( self::class, 'can_manage' ),
				)
			);
		}
	}

	/**
	 * Adds the REST guard and the section ids for every covered post type.
	 *
	 * @return void
	 */
	public static function register_rest_guards() {
		foreach ( self::post_types() as $type ) {
			add_filter( 'rest_pre_insert_' . $type, array( self::class, 'rest_guard' ) );
			add_filter( 'rest_prepare_' . $type, array( self::class, 'rest_ids' ), 10, 2 );
		}
	}

	/**
	 * Stops anyone but an administrator writing the flag, whatever the route.
	 *
	 * @param null|bool $check    Whether to short-circuit.
	 * @param int       $post_id  Post ID.
	 * @param string    $meta_key Meta key.
	 * @return null|bool
	 */
	public static function guard_meta( $check, $post_id, $meta_key ) {
		if ( self::META !== $meta_key || self::$writing || self::can_manage() ) {
			return $check;
		}
		return false;
	}

	/**
	 * Locks a page as it is created, by whoever creates it.
	 *
	 * @param int    $post_id Post ID.
	 * @param object $post    The post.
	 * @param bool   $update  Whether this is an update.
	 * @return void
	 */
	public static function lock_new_page( $post_id, $post, $update ) {
		if ( $update || ! $post || ! self::covers( $post->post_type ) ) {
			return;
		}
		if ( ! apply_filters( 'blueworx_page_lock_new_pages', true, $post ) ) {
			return;
		}
		self::$writing = true;
		update_post_meta( (int) $post_id, self::META, true );
		self::$writing = false;
	}

	/**
	 * Refuses a REST save that would change a locked page's sections.
	 *
	 * @param object|\WP_Error $prepared The post as prepared for the database.
	 * @return object|\WP_Error
	 */
	public static function rest_guard( $prepared ) {
		if ( is_wp_error( $prepared ) || empty( $prepared->ID ) || ! isset( $prepared->post_content ) ) {
			return $prepared;
		}
		if ( ! self::applies( $prepared->ID ) ) {
			return $prepared;
		}
		$existing = get_post( $prepared->ID );
		if ( $existing && self::refuses( $existing->post_content, $prepared->post_content ) ) {
			return new \WP_Error( 'blueworx_page_locked', self::message(), array( 'status' => 403 ) );
		}
		return $prepared;
	}

	/**
	 * Gives whoever the lock holds the ids of the sections they are reading.
	 *
	 * Not before WordPress 6.5, whose block previews refuse metadata.
	 *
	 * @param object $response The response.
	 * @param object $post     The post.
	 * @return object
	 */
	public static function rest_ids( $response, $post ) {
		if ( ! isset( \WP_Block_Type::GLOBAL_ATTRIBUTES['metadata'] ) ) {
			return $response;
		}
		$data = $response->get_data();
		if ( isset( $data['content']['raw'] ) && self::applies( $post->ID ) ) {
			$data['content']['raw'] = self::with_ids( $data['content']['raw'] );
			$response->set_data( $data );
		}
		return $response;
	}

	/**
	 * Keeps a locked page's content on any save that is not REST, and takes the
	 * section ids off whatever is saved.
	 *
	 * There is no way to refuse from here with a message, so the content stays
	 * as it was and the rest of the save (title, excerpt) goes through.
	 *
	 * @param array $data    Slashed post data about to be written.
	 * @param array $postarr The full post array, including ID.
	 * @return array
	 */
	public static function insert_guard( $data, $postarr ) {
		$post_id = isset( $postarr['ID'] ) ? (int) $postarr['ID'] : 0;
		if ( ! isset( $data['post_content'] ) ) {
			return $data;
		}
		$content = wp_unslash( $data['post_content'] );
		if ( $post_id && self::applies( $post_id ) ) {
			$existing = get_post( $post_id );
			if ( $existing && self::refuses( $existing->post_content, $content ) ) {
				$data['post_content'] = wp_slash( $existing->post_content );
				return $data;
			}
		}
		$saved = self::without_ids( $content );
		if ( $saved !== $content ) {
			$data['post_content'] = wp_slash( $saved );
		}
		return $data;
	}

	/**
	 * Locks the editor for anyone who may not change the page.
	 *
	 * @param array  $settings Editor settings.
	 * @param object $context  Editor context.
	 * @return array
	 */
	public static function editor_settings( $settings, $context ) {
		if ( empty( $context->post ) || ! self::applies( $context->post->ID ) ) {
			return $settings;
		}
		$settings['codeEditingEnabled'] = false;
		$settings['canLockBlocks']      = false;
		if ( self::frozen( $context->post ) ) {
			$settings['templateLock'] = 'all';
		}
		return $settings;
	}

	/**
	 * The namespaces a site's own section blocks use.
	 *
	 * Every namespace but WordPress's own, unless the site names its own.
	 *
	 * @param string[] $names Every registered block name.
	 * @return string[]
	 */
	public static function section_blocks( $names ) {
		$namespaces = apply_filters( 'blueworx_page_lock_section_namespaces', null );
		$out        = array();
		foreach ( (array) $names as $name ) {
			$namespace = strstr( (string) $name, '/', true );
			if ( false === $namespace ) {
				continue;
			}
			$wanted = null === $namespaces ? 'core' !== $namespace : in_array( $namespace, (array) $namespaces, true );
			if ( $wanted ) {
				$out[] = (string) $name;
			}
		}
		return $out;
	}

	/**
	 * Offers only the site's section blocks on a locked page.
	 *
	 * @param bool|string[] $allowed Allowed block names, or true for all.
	 * @param object        $context Editor context.
	 * @return bool|string[]
	 */
	public static function allowed_blocks( $allowed, $context ) {
		if ( false === $allowed || empty( $context->post ) || ! self::applies( $context->post->ID ) ) {
			return $allowed;
		}
		$names    = array_keys( \WP_Block_Type_Registry::get_instance()->get_all_registered() );
		$sections = self::section_blocks( $names );
		if ( is_array( $allowed ) ) {
			$sections = array_values( array_intersect( $sections, $allowed ) );
		}
		return $sections;
	}

	/**
	 * Marks locked pages in the Pages list.
	 *
	 * @param string[] $states Post states.
	 * @param object   $post   The post.
	 * @return string[]
	 */
	public static function post_state( $states, $post ) {
		if ( $post && self::covers( $post->post_type ) && self::is_locked( $post->ID ) ) {
			$states['blueworx_page_lock'] = __( 'Locked', 'blueworx-page-lock' );
		}
		return $states;
	}

	/**
	 * Adds the Page lock panel and the client view to the block editor.
	 *
	 * @return void
	 */
	public static function editor_assets() {
		$post = get_post();
		if ( ! $post || ! self::covers( $post->post_type ) || '' === self::$url ) {
			return;
		}

		wp_enqueue_script(
			'blueworx-page-lock',
			self::$url . 'v1/page-lock.js',
			array( 'wp-plugins', 'wp-editor', 'wp-components', 'wp-data', 'wp-element' ),
			self::$version,
			true
		);
		wp_localize_script(
			'blueworx-page-lock',
			'blueworxPageLock',
			array(
				'metaKey'      => self::META,
				'canManage'    => self::can_manage(),
				'openListView' => self::applies( $post->ID ),
				// The page has no layout yet: lock the editor once its first one is saved.
				'lockOnSave'   => self::applies( $post->ID ) && ! self::frozen( $post ),
				'noAddButton'  => self::NO_ADD_BUTTON,
				'copy'         => array(
					'title'    => __( 'Page lock', 'blueworx-page-lock' ),
					'label'    => __( 'Locked', 'blueworx-page-lock' ),
					'help'     => __( 'Everyone else can change the words, images and links on this page, but not add, move or remove sections.', 'blueworx-page-lock' ),
					'unlocked' => __( 'Anyone who can edit this page can change its sections.', 'blueworx-page-lock' ),
					'locked'   => __( 'This page is locked. You can change its words, images and links, but not add, move or remove sections.', 'blueworx-page-lock' ),
				),
			)
		);

		// A button that never works is clutter, so it goes.
		if ( self::frozen( $post ) ) {
			wp_register_style( 'blueworx-page-lock', false, array(), self::$version );
			wp_enqueue_style( 'blueworx-page-lock' );
			wp_add_inline_style( 'blueworx-page-lock', self::NO_ADD_BUTTON );
		}
	}
}
