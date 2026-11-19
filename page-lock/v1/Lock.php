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
 * went out. A REST save that changes the shape is refused with a message; any
 * other write keeps the content the page had.
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
	private static $version = '1.0.0';

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
	 * The shape of a block tree: which blocks, in which order, nested how.
	 *
	 * Reads the block comments WordPress writes into post content and returns a
	 * nested list of [ block name, children ]. Text, markup and attributes are
	 * ignored, because a locked page is still a page somebody may write on.
	 *
	 * @param string $content Post content.
	 * @return array<int, array{0: string, 1: array}>
	 */
	public static function shape( $content ) {
		$root  = array();
		$stack = array( &$root );

		// <!-- wp:name {"json":1} --> … <!-- /wp:name -->, or <!-- wp:name /-->.
		if ( ! preg_match_all( '#<!--\s+(/)?wp:([a-z][a-z0-9_-]*(?:/[a-z][a-z0-9_-]*)?)(?:\s+\{.*?\})?\s*(/)?-->#s', (string) $content, $matches, PREG_SET_ORDER ) ) {
			return $root;
		}

		foreach ( $matches as $m ) {
			$closing = '' !== $m[1];
			$name    = false === strpos( $m[2], '/' ) ? 'core/' . $m[2] : $m[2];
			$void    = isset( $m[3] ) && '' !== $m[3];
			$depth   = count( $stack ) - 1;

			if ( $closing ) {
				if ( $depth > 0 ) {
					array_pop( $stack );
				}
				continue;
			}

			$stack[ $depth ][] = array( $name, array() );
			$index             = count( $stack[ $depth ] ) - 1;

			if ( ! $void ) {
				$stack[] = &$stack[ $depth ][ $index ][1];
			}
		}

		return $root;
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
		$was = self::shape( $before );
		return array() !== $was && self::shape( $after ) !== $was;
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
	 * Adds the REST guard for every covered post type.
	 *
	 * @return void
	 */
	public static function register_rest_guards() {
		foreach ( self::post_types() as $type ) {
			add_filter( 'rest_pre_insert_' . $type, array( self::class, 'rest_guard' ) );
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
	 * Keeps a locked page's content on any save that is not REST.
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
		if ( ! $post_id || ! isset( $data['post_content'] ) || ! self::applies( $post_id ) ) {
			return $data;
		}
		$existing = get_post( $post_id );
		if ( $existing && self::refuses( $existing->post_content, wp_unslash( $data['post_content'] ) ) ) {
			$data['post_content'] = wp_slash( $existing->post_content );
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
				'copy'         => array(
					'title'    => __( 'Page lock', 'blueworx-page-lock' ),
					'label'    => __( 'Locked', 'blueworx-page-lock' ),
					'help'     => __( 'Everyone else can change the words, images and links on this page, but not add, move or remove sections.', 'blueworx-page-lock' ),
					'unlocked' => __( 'Anyone who can edit this page can change its sections.', 'blueworx-page-lock' ),
					'locked'   => __( 'This page is locked. You can change its words, images and links, but not add, move or remove sections.', 'blueworx-page-lock' ),
				),
			)
		);

		// The add-block button stays on screen, greyed out, when the editor is
		// locked; a button that never works is clutter, so it goes.
		if ( self::frozen( $post ) ) {
			wp_register_style( 'blueworx-page-lock', false, array(), self::$version );
			wp_enqueue_style( 'blueworx-page-lock' );
			wp_add_inline_style( 'blueworx-page-lock', '.editor-document-tools__inserter-toggle,.edit-post-header-toolbar__inserter-toggle{display:none!important}' );
		}
	}
}
