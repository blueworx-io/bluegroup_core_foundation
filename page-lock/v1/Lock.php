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

	/** What an id looks like: the section's place on the page, such as 2, or 2.0 for the first one inside it. */
	const PLACE = '\d+(?:\.\d+)*';

	/** How a line break standing alone is named in a list of tags. It starts with a character no tag name can, so no tag in a page can pass for it. */
	const STANDALONE_BREAK = '<!br';

	/** How the tags inside an inline SVG start in a list of tags, kept as one piece of text. No tag name can start like this. */
	const SVG_INSIDE = '<!svg ';

	/** Elements that are part of the words they sit in. */
	const INLINE = 'a|abbr|b|bdi|bdo|br|cite|code|del|em|font|i|ins|kbd|mark|q|s|samp|small|span|strike|strong|sub|sup|time|tt|u|var|wbr';

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
	private static $version = '1.0.8';

	/**
	 * True while the lock writes its own flag, so its own guard lets it through.
	 *
	 * @var bool
	 */
	private static $writing = false;

	/**
	 * The page a revision is being restored to, 0 for none.
	 *
	 * @var int
	 */
	private static $restoring = 0;

	/**
	 * The page whose last save had its content put back, 0 for none.
	 *
	 * @var int
	 */
	private static $dropped = 0;

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
		add_filter( 'register_block_type_args', array( self::class, 'room_for_ids' ) );
		add_action( 'init', array( self::class, 'register_rest_guards' ), 20 );
		add_filter( 'add_post_metadata', array( self::class, 'guard_meta' ), 10, 3 );
		add_filter( 'update_post_metadata', array( self::class, 'guard_meta' ), 10, 3 );
		add_filter( 'delete_post_metadata', array( self::class, 'guard_meta' ), 10, 3 );
		add_filter( 'wp_insert_post_data', array( self::class, 'insert_guard' ), 10, 2 );
		add_action( 'wp_insert_post', array( self::class, 'lock_new_page' ), 10, 3 );
		add_action( 'load-revision.php', array( self::class, 'check_restore' ) );
		add_filter( 'redirect_post_location', array( self::class, 'redirect_post_location' ), 10, 2 );
		add_action( 'admin_notices', array( self::class, 'notice' ) );
		add_filter( 'removable_query_args', array( self::class, 'removable_query_args' ) );
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
			// A marker that closes itself is a section, even with a slash in front of its name: WordPress reads it that way.
			$closing = '' !== $m['closer'][0] && empty( $m['void'][0] );

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
		return self::relays( $was, $now ) || ( $was['children'] && self::moves( $was, $now, $was, '' ) );
	}

	/**
	 * Whether the sections, or the elements outside them, are not the same ones.
	 *
	 * @param array $was Page as saved.
	 * @param array $now Page being saved.
	 * @return bool
	 */
	private static function relays( $was, $now ) {
		if ( ! $was['children'] ) {
			return false;
		}
		if ( self::outline( $now ) !== self::outline( $was ) ) {
			return true;
		}
		foreach ( $now['html'] as $i => $html ) {
			$old      = $was['html'][ $i ];
			$elements = self::elements( $html, true );
			$before   = self::elements( $old, true );
			$plain    = self::elements( $old, false );
			// As it is saved, or as the block editor redraws it by opening the page.
			if ( false !== $elements && ( $before === $elements || $plain === $elements ) ) {
				continue;
			}
			// Words typed beside a break standing alone inside an SVG make it part of the words, but it is still there.
			// Read with every break inside an SVG counted, the layout is then the same.
			$every = self::elements( $html, true, true );
			if ( false !== $every && self::elements( $old, true, true ) === $every ) {
				continue;
			}
			// Markup that could not be read says nothing about its elements, so it has to be the same text.
			if ( ( false === $elements || false === $before || false === $plain ) && trim( $old ) === trim( $html ) ) {
				continue;
			}
			return true;
		}
		return false;
	}

	/**
	 * Markup with line breaks inside words taken as words, so they cannot end a
	 * paragraph, and breaks standing alone taken as elements.
	 *
	 * @param string $html Markup from outside the sections.
	 * @return string|null Null when it could not be worked on.
	 */
	private static function as_words( $html ) {
		// A tag runs to its closing bracket, so a "<br" written inside a quoted attribute is not a line break.
		// Read the way the tag reader reads, so what is written inside a textarea (or a comment) is text and left alone.
		$safe  = '';
		$taken = 0;
		$pos   = 0;
		while ( true ) {
			$token = self::next_token( $html, $pos, false );
			if ( null === $token ) {
				break;
			}
			$pos = $token['next'];
			if ( 'tag' !== $token['kind'] || null === $token['name'] ) {
				continue;
			}
			$tag = substr( $html, $token['start'], $token['end'] - $token['start'] );
			if ( false === strpos( $tag, '"' ) && false === strpos( $tag, "'" ) ) {
				continue;
			}
			$tag = preg_replace_callback(
				'#"[^"]*+"|\'[^\']*+\'#',
				function ( $quoted ) {
					return strtr( $quoted[0], array( '<' => '&lt;', '>' => '&gt;' ) );
				},
				$tag
			);
			if ( null === $tag ) {
				return null;
			}
			$safe .= substr( $html, $taken, $token['start'] - $taken ) . $tag;
			$taken = $token['end'];
		}
		$html = $safe . substr( $html, $taken );
		$edge = '<(?!/?(?:' . self::INLINE . ')\b)[^>]*>';
		$html = preg_replace_callback(
			'#(^|' . $edge . ')((?:\s*<br\b[^>]*>)+)(?=\s*(?:$|' . $edge . '))#i',
			function ( $m ) {
				return $m[1] . str_repeat( '<hr class="bwplbr">', preg_match_all( '#<br#i', $m[2] ) );
			},
			$html
		);
		return null === $html ? null : preg_replace( '#<br\b[^>]*>#i', ' . ', $html );
	}

	/**
	 * The elements outside the sections in one piece of markup.
	 *
	 * Large inline SVGs are set aside first, before anything else reads the
	 * markup, so what is written inside one (a description, an unfinished tag
	 * example, a comment) can neither be mistaken for markup nor damaged by the
	 * tidying of the words round it.
	 *
	 * @param string $html  Markup from outside the sections.
	 * @param bool   $words Whether line breaks are read as the editor does, inside words.
	 * @param bool   $every Whether every line break inside an SVG counts as an element, not only those standing alone.
	 * @return string[]|false The elements, or false when the markup could not be read.
	 */
	private static function elements( $html, $words, $every = false ) {
		// The marks put on a break standing alone, and where an SVG stood, are ours: the same words written in the page
		// are not them. Each one the page has gets a dash after it, so no two different names come to read the same.
		$html   = str_ireplace( array( 'bwplbr', 'bwplsv' ), array( 'bwplbr-', 'bwplsv-' ), $html );
		$svgs   = array();
		$masked = self::set_aside_svgs( $html, $svgs );
		return self::structure( $words ? self::as_words( $masked ) : $masked, $svgs, $every );
	}

	/**
	 * The elements in some markup, in order.
	 *
	 * Links and formatting inside words are left out, as they are part of the
	 * words. Paragraph tags are put round plain words first, as the block editor
	 * does itself just by opening the page.
	 *
	 * @param string|null $html Markup from outside the sections with its SVGs set aside, or null when it could not be cleaned up.
	 * @param string[]    $svgs  The SVGs that were set aside, in order.
	 * @param bool        $every Whether every line break inside an SVG counts as an element.
	 * @return string[]|false The elements, or false when the markup could not be read.
	 */
	private static function structure( $html, $svgs = array(), $every = false ) {
		if ( null === $html ) {
			return false;
		}
		$bare = preg_replace( '/<!--.*?-->/s', '', $html );
		if ( null === $bare ) {
			return false;
		}
		if ( '' === trim( $bare ) ) {
			return array();
		}
		// A large inline SVG is more than WordPress can work on, and it hands back nothing, which must not read as no
		// elements. The words round it are tidied as they are anywhere else, and its own tags are put back where it stood.
		$html = strtolower( wpautop( $bare ) );
		if ( '' === trim( $html ) ) {
			return false;
		}
		$names = self::tag_names( $html );
		if ( false === $names ) {
			return false;
		}
		$out  = array();
		$next = 0;
		foreach ( $names as $name ) {
			if ( '<bwplsvg' === $name && isset( $svgs[ $next ] ) ) {
				$inside = self::svg_tag_names( $svgs[ $next ], $every );
				++$next;
				if ( false === $inside ) {
					return false;
				}
				$out[] = $inside;
				continue;
			}
			$out[] = $name;
		}
		return array_values( preg_grep( '#^</?(?:' . self::INLINE . ')$#', $out, PREG_GREP_INVERT ) );
	}

	/**
	 * Markup with each inline SVG taken out and a marker left in its place.
	 *
	 * Found by position, not by a pattern, so a very large SVG cannot run PHP's
	 * regex engine out of steps. Comments, CDATA, processing instructions and
	 * whole tags are passed over as they come, so an SVG tag written inside one
	 * of them is not an SVG. One that never closes is left as it is.
	 *
	 * @param string   $html Markup from outside the sections.
	 * @param string[] $svgs Filled with each SVG taken out, in order.
	 * @return string
	 */
	private static function set_aside_svgs( $html, &$svgs ) {
		$out   = '';
		$taken = 0;
		$pos   = 0;
		$start = 0;
		$stack = self::fresh_state();
		while ( true ) {
			$token = self::next_token( $html, $pos, self::is_foreign( $stack ) );
			if ( ! is_array( $token ) ) {
				break;
			}
			$pos    = $token['next'];
			$before = $stack['svg'];
			self::track( $stack, $token );
			if ( 'svg' !== $token['name'] || ( $token['close'] && $before < 1 ) ) {
				continue;
			}
			if ( ! $token['close'] && 0 === $before ) {
				$start = $token['start'];
			}
			if ( 0 === $stack['svg'] ) {
				$svgs[] = substr( $html, $start, $token['end'] - $start );
				$out   .= substr( $html, $taken, $start - $taken ) . '<bwplsvg/>';
				$taken  = $token['end'];
			}
		}
		return $out . substr( $html, $taken );
	}

	/**
	 * A fresh record of what is being read, for track().
	 *
	 * @return array
	 */
	private static function fresh_state() {
		return array(
			'open'  => array(),
			'names' => array(),
			'svg'   => 0,
		);
	}

	/**
	 * Keeps track of which kind of markup is being read, as a browser does: inside an
	 * SVG or MathML the rules for those apply, and HTML starts again inside the
	 * places that hold HTML (an SVG's foreignObject, desc and title, and MathML's text).
	 *
	 * Only those elements are kept, and how many of each is open, so a long run of
	 * other tags costs nothing and a deeply nested SVG is not walked again for each tag.
	 *
	 * @param array $state From fresh_state(): the open elements (name, kind, and whether nothing has opened inside a place that holds HTML yet), innermost last.
	 * @param array $token A token from next_token().
	 * @return void
	 */
	private static function track( &$state, $token ) {
		$name = $token['name'];
		if ( null === $name ) {
			return;
		}
		$count = count( $state['open'] );
		if ( $token['close'] ) {
			if ( empty( $state['names'][ $name ] ) ) {
				return;
			}
			for ( $i = $count - 1; $i >= 0; $i-- ) {
				if ( $state['open'][ $i ][0] === $name ) {
					for ( $j = $i; $j < $count; $j++ ) {
						--$state['names'][ $state['open'][ $j ][0] ];
						if ( 'svg' === $state['open'][ $j ][0] ) {
							--$state['svg'];
						}
					}
					array_splice( $state['open'], $i );
					return;
				}
			}
			return;
		}
		if ( $token['self'] ) {
			return;
		}
		$kind = $count ? $state['open'][ $count - 1 ][1] : 'html';
		if ( $count && 'html' === $kind ) {
			// Something has opened in this place, so what follows is no longer straight inside the SVG or MathML element.
			$state['open'][ $count - 1 ][2] = false;
		}
		$push = null;
		if ( 'svg' === $name || 'math' === $name ) {
			$push = array( $name, $name, false );
		} elseif ( 'svg' === $kind && in_array( $name, array( 'foreignobject', 'desc', 'title' ), true ) ) {
			$push = array( $name, 'html', true );
		} elseif ( 'math' === $kind && in_array( $name, array( 'mi', 'mo', 'mn', 'ms', 'mtext' ), true ) ) {
			$push = array( $name, 'html', true );
		}
		if ( null !== $push ) {
			$state['open'][] = $push;
			$state['names'][ $name ] = isset( $state['names'][ $name ] ) ? $state['names'][ $name ] + 1 : 1;
			if ( 'svg' === $name ) {
				++$state['svg'];
			}
		}
	}

	/**
	 * How the next token is to be read.
	 *
	 * Inside an SVG or MathML it is read by their rules (true). Inside a place that holds
	 * HTML it is read by HTML rules (false), except that CDATA still counts straight
	 * inside the place, where the element round it is the SVG's or MathML's ("mixed").
	 *
	 * @param array $state From fresh_state().
	 * @return bool|string
	 */
	private static function is_foreign( $state ) {
		$count = count( $state['open'] );
		if ( 0 === $count ) {
			return false;
		}
		$top = $state['open'][ $count - 1 ];
		if ( 'html' !== $top[1] ) {
			return true;
		}
		return $top[2] ? 'mixed' : false;
	}

	/**
	 * The tags inside one SVG, in order, as one piece of text.
	 *
	 * Comments, CDATA and processing instructions are not tags, whatever they say.
	 * Tags that are part of words are left out, as they are outside an SVG. Line breaks
	 * standing alone between elements count as elements, as they do outside an SVG
	 * (inside a foreignObject they change the spacing), and they are kept even when
	 * the editor would drop them, as it does not touch an SVG.
	 *
	 * Read as it comes, keeping only the tag before a run of breaks and the one after
	 * and the names in one piece of text, so a very large SVG does not have to be held
	 * tag by tag.
	 *
	 * @param string $svg   The SVG's markup.
	 * @param bool   $every Whether every line break counts as an element, wherever it stands.
	 * @return string|false The names, or false when the SVG could not be read.
	 */
	private static function svg_tag_names( $svg, $every = false ) {
		$names  = '';
		$state  = self::fresh_state();
		$inline = array_flip( explode( '|', self::INLINE ) );
		$pos    = 0;
		$prev   = null;
		$run    = 0;
		$first  = null;
		$last   = null;
		$before = null;
		while ( true ) {
			$token = self::next_token( $svg, $pos, self::is_foreign( $state ) );
			if ( null === $token ) {
				break;
			}
			if ( $token['bad'] ) {
				return false;
			}
			$pos = $token['next'];
			self::track( $state, $token );
			$joins = $run > 0 && self::is_break( $token ) && self::blank_between( $svg, $last, $token );
			if ( $run > 0 && ! $joins ) {
				// A run of breaks with only space between them, read once from its first break.
				$names .= self::break_names( $svg, $every, $run, array( $before, $first, $last, $token ) );
				$prev   = $last;
				$run    = 0;
			}
			if ( null === $token['name'] ) {
				$prev = $token;
				continue;
			}
			if ( self::is_break( $token ) ) {
				if ( $joins ) {
					++$run;
					$last = $token;
				} else {
					$run    = 1;
					$first  = $token;
					$last   = $token;
					$before = $prev;
				}
				continue;
			}
			if ( ! isset( $inline[ $token['name'] ] ) ) {
				$names .= ( $token['close'] ? '</' : '<' ) . $token['name'] . ' ';
			}
			$prev = $token;
		}
		if ( $run > 0 ) {
			$names .= self::break_names( $svg, $every, $run, array( $before, $first, $last, null ) );
		}
		return self::SVG_INSIDE . $names;
	}

	/**
	 * The names for a run of line breaks inside an SVG: only those standing alone count.
	 *
	 * Standing alone between two elements (or comments), a break is an element of its own.
	 *
	 * @param string $svg    The SVG's markup.
	 * @param bool   $every  Whether every break counts as an element.
	 * @param int    $run    How many breaks.
	 * @param array  $around The token before the run (or null), its first and last break, and the token after it (or null).
	 * @return string
	 */
	private static function break_names( $svg, $every, $run, $around ) {
		list( $before, $first, $last, $after ) = $around;
		$inline = '#^(?:' . self::INLINE . ')$#';
		$alone  = $every || ( null !== $before && self::blank_between( $svg, $before, $first )
			&& ( null === $after || self::blank_between( $svg, $last, $after ) )
			&& self::is_edge( $before, $inline ) && ( null === $after || self::is_edge( $after, $inline ) ) );
		return $alone ? str_repeat( self::STANDALONE_BREAK . ' ', $run ) : '';
	}

	/**
	 * Whether a token is an opening line break.
	 *
	 * @param array $token A token from next_token().
	 * @return bool
	 */
	private static function is_break( $token ) {
		return 'br' === $token['name'] && ! $token['close'];
	}

	/**
	 * Whether only space lies between two tokens.
	 *
	 * @param string $html  Markup.
	 * @param array  $first The earlier token.
	 * @param array  $next  The later token.
	 * @return bool
	 */
	private static function blank_between( $html, $first, $next ) {
		return '' === trim( substr( $html, $first['end'], $next['start'] - $first['end'] ) );
	}

	/**
	 * Whether a token separates elements: any tag that is not part of words, a
	 * comment, or a processing instruction. CDATA is words.
	 *
	 * @param array  $token  A token from next_token().
	 * @param string $inline Pattern for the tags that are part of words.
	 * @return bool
	 */
	private static function is_edge( $token, $inline ) {
		if ( null !== $token['name'] ) {
			return ! preg_match( $inline, $token['name'] );
		}
		return 'cdata' !== $token['kind'];
	}

	/**
	 * The next tag in some markup, or the next comment, CDATA section or
	 * processing instruction, which are passed over whole.
	 *
	 * What is inside a textarea, script or style is text, so it is passed over too.
	 * Something that never ends is reported as bad and only its opening is passed over,
	 * so one stray "<?" cannot hide the markup after it.
	 *
	 * Like a browser, a processing instruction ends at the first closing bracket, and
	 * CDATA only counts as CDATA inside an SVG; elsewhere it ends there too.
	 *
	 * @param string      $html    Markup.
	 * @param int         $from    Where to start looking.
	 * @param bool|string $foreign True inside an SVG or MathML, "mixed" straight inside a place there that holds HTML (CDATA still counts), false in HTML.
	 * @return array|null Null at the end. Otherwise its start, end, where to carry on from (next), its kind, lowercase tag name (null when it is not a tag), whether it closes or closes itself, and whether it is bad.
	 */
	private static function next_token( $html, $from, $foreign = false ) {
		if ( ! preg_match( '#<!--|<!\[CDATA\[|<\?|</?[a-z]#i', $html, $found, PREG_OFFSET_CAPTURE, $from ) ) {
			return null;
		}
		$start = $found[0][1];
		$open  = $found[0][0];
		$kinds = array(
			'<!--'      => array( '-->', 'comment' ),
			'<![CDATA[' => array( true === $foreign || 'mixed' === $foreign ? ']]>' : '>', 'cdata' ),
			'<?'        => array( '>', 'instruction' ),
		);
		$key = strtoupper( $open ) === '<![CDATA[' ? '<![CDATA[' : $open;
		if ( isset( $kinds[ $key ] ) ) {
			$end = strpos( $html, $kinds[ $key ][0], $start + strlen( $open ) );
			$bad = false === $end;
			$end = $bad ? $start + strlen( $open ) : $end + strlen( $kinds[ $key ][0] );
			return array(
				'start' => $start,
				'end'   => $end,
				'next'  => $end,
				'kind'  => $kinds[ $key ][1],
				'name'  => null,
				'close' => false,
				'self'  => false,
				'bad'   => $bad,
			);
		}
		// A tag runs to its closing bracket, and what a quoted attribute says is not part of the markup.
		if ( ! preg_match( '#</?([a-z][a-z0-9-]*+)(?:"[^"]*+"|\'[^\']*+\'|[^>"\']++)*+>#iA', $html, $tag, 0, $start ) ) {
			return array(
				'start' => $start,
				'end'   => $start + 1,
				'next'  => $start + 1,
				'kind'  => 'tag',
				'name'  => null,
				'close' => false,
				'self'  => false,
				'bad'   => true,
			);
		}
		$name  = strtolower( $tag[1] );
		$end   = $start + strlen( $tag[0] );
		$close = '</' === substr( $tag[0], 0, 2 );
		$self  = '/>' === substr( $tag[0], -2 );
		$next  = $end;
		// Outside an SVG a slash does not close these, so what follows is still text; inside one only these three hold text.
		$raw = true === $foreign ? array( 'textarea', 'script', 'style' ) : array( 'textarea', 'script', 'style', 'title', 'xmp', 'iframe', 'noembed', 'noframes' );
		if ( ! $close && ( ! $self || true !== $foreign ) && in_array( $name, $raw, true ) ) {
			// Its end is its own closing tag, not one that only starts with the same letters.
			$next = preg_match( '#</' . $name . '(?=[\s/>])#i', $html, $raw, PREG_OFFSET_CAPTURE, $end ) ? $raw[0][1] : $end;
		}
		return array(
			'start' => $start,
			'end'   => $end,
			'next'  => $next,
			'kind'  => 'tag',
			'name'  => $name,
			'close' => $close,
			'self'  => $self,
			'bad'   => false,
		);
	}

	/**
	 * The names of the tags in some markup, in order.
	 *
	 * A comment nobody closed would hide the sections after it, so its opening is
	 * listed too. Read like the SVG finder reads: a tag runs to its closing bracket,
	 * what a quoted attribute says is not part of the markup, and what is inside a
	 * textarea (or script, style and the like) is text, not tags.
	 *
	 * @param string $html Markup.
	 * @return string[]|false The names, or false when the markup could not be read.
	 */
	private static function tag_names( $html ) {
		$names  = array();
		$pos    = 0;
		$marker = '<hr class="bwplbr"';
		while ( true ) {
			$token = self::next_token( $html, $pos, false );
			if ( null === $token ) {
				break;
			}
			$pos = $token['next'];
			if ( 'comment' === $token['kind'] ) {
				if ( $token['bad'] ) {
					$names[] = '<!--';
				}
				continue;
			}
			if ( 'tag' !== $token['kind'] ) {
				continue;
			}
			if ( null === $token['name'] ) {
				// A tag that never ends is still a tag.
				if ( preg_match( '#</?[a-z][a-z0-9-]*#', $html, $name, 0, $token['start'] ) ) {
					$names[] = $name[0];
				}
				continue;
			}
			// A break standing alone, which as_words() turned into a marked rule, is not the same element as a real rule.
			$names[] = substr( $html, $token['start'], strlen( $marker ) ) === $marker ? self::STANDALONE_BREAK : ( $token['close'] ? '</' : '<' ) . $token['name'];
		}
		return $names;
	}

	/**
	 * Whether sections of one type have changed places.
	 *
	 * A section that came back with its id has to be where it was. One without
	 * an id, from an editor still open since the first layout was saved or from
	 * something that dropped it, is only known by its words, so it counts as moved when whole sections
	 * have traded places word for word. Any other edit is taken as words. An id
	 * that is somehow saved in the page says nothing about where it was read.
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
			if ( '' === $id || ! self::has_id( $page, $id ) || self::id_of( $was['children'][ $i ] ) === $id ) {
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
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize -- compared here and thrown away.
		return serialize(
			array(
				$node['name'],
				self::sorted( (array) json_decode( self::unmark( $node['attrs'] ), true ) ),
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
	 * The id the lock gave a block, or ''.
	 *
	 * @param array $node Block from read().
	 * @return string
	 */
	private static function id_of( $node ) {
		$attrs = json_decode( $node['attrs'] );
		$id    = isset( $attrs->metadata->{self::ID} ) ? $attrs->metadata->{self::ID} : '';
		return is_string( $id ) && preg_match( '/^' . self::PLACE . '$/D', $id ) ? $id : '';
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
		return self::each_block( $content, array( self::class, 'mark' ) );
	}

	/**
	 * Content with every section's id taken off.
	 *
	 * @param string $content Post content.
	 * @return string
	 */
	public static function without_ids( $content ) {
		return self::each_block( $content, array( self::class, 'unmark' ) );
	}

	/**
	 * Content with each block's settings changed.
	 *
	 * @param string   $content Post content.
	 * @param callable $change  Given the settings as written and the block's id.
	 * @return string
	 */
	private static function each_block( $content, $change ) {
		$ids = array();
		self::list_ids( self::read( $content ), '', $ids );
		// Last first, so the places of those before it stay right.
		foreach ( array_reverse( $ids, true ) as $id => $node ) {
			$attrs = call_user_func( $change, $node['attrs'], (string) $id );
			if ( $attrs === $node['attrs'] ) {
				continue;
			}
			$comment = substr( $content, $node['at'], $node['length'] );
			if ( '' === $node['attrs'] ) {
				$comment = preg_replace( '#\s+(/?-->)$#', ' ' . $attrs . ' $1', $comment );
			} elseif ( '' === $attrs ) {
				$comment = preg_replace( '#\s*' . preg_quote( $node['attrs'], '#' ) . '#', '', $comment );
			} else {
				$comment = str_replace( $node['attrs'], $attrs, $comment );
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
	 * A block's settings with its id added, or as they are where it cannot be.
	 *
	 * @param string $attrs Settings, as written, or ''.
	 * @param string $id    Id.
	 * @return string
	 */
	private static function mark( $attrs, $id ) {
		$mark     = '"' . self::ID . '":"' . $id . '"';
		$settings = json_decode( $attrs );
		if ( '' === $attrs ) {
			return '{"metadata":{' . $mark . '}}';
		}
		if ( ! is_object( $settings ) ) {
			return $attrs;
		}
		if ( ! get_object_vars( $settings ) ) {
			return '{"metadata":{' . $mark . '}}';
		}
		if ( ! property_exists( $settings, 'metadata' ) ) {
			return substr( $attrs, 0, -1 ) . ',"metadata":{' . $mark . '}}';
		}
		if ( ! is_object( $settings->metadata ) || ! get_object_vars( $settings->metadata ) ) {
			return $attrs;
		}
		$settings->metadata = (object) array_merge( array( self::ID => $id ), get_object_vars( $settings->metadata ) );
		return self::rewrite( $attrs, '"metadata"\s*:\s*\{', '$0' . $mark . ',', $settings );
	}

	/**
	 * A block's settings with its id taken off.
	 *
	 * @param string $attrs Settings, as written, or ''.
	 * @return string
	 */
	private static function unmark( $attrs ) {
		if ( '' === self::id_of( array( 'attrs' => $attrs ) ) ) {
			return $attrs;
		}
		$settings = json_decode( $attrs );
		$mark     = '"' . self::ID . '"\s*:\s*"' . self::PLACE . '"';
		unset( $settings->metadata->{self::ID} );
		if ( ! get_object_vars( $settings->metadata ) ) {
			unset( $settings->metadata );
			$mark = '"metadata"\s*:\s*\{\s*' . $mark . '\s*\}';
		}
		$attrs = self::rewrite( $attrs, ',\s*' . $mark . '|' . $mark . '(?:\s*,\s*)?', '', $settings );
		return get_object_vars( $settings ) ? $attrs : '';
	}

	/**
	 * Settings with the one change made that gives the settings wanted.
	 *
	 * The text is changed rather than written out again, so everything else in it
	 * stays exactly as it was saved, and only where the result is what was meant:
	 * the same words can turn up again inside a list.
	 *
	 * @param string $attrs   Settings, as written.
	 * @param string $pattern What to replace.
	 * @param string $with    What to put there.
	 * @param object $wanted  The settings that should come out.
	 * @return string
	 */
	private static function rewrite( $attrs, $pattern, $with, $wanted ) {
		preg_match_all( '/' . $pattern . '/', $attrs, $matches, PREG_OFFSET_CAPTURE );
		foreach ( $matches[0] as $match ) {
			$out = substr_replace( $attrs, str_replace( '$0', $match[0], $with ), $match[1], strlen( $match[0] ) );
			// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize -- compared here and thrown away.
			if ( serialize( json_decode( $out ) ) === serialize( $wanted ) ) {
				return $out;
			}
		}
		return $attrs;
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
	 * Whether a save puts back one of the page's own revisions.
	 *
	 * Revisions have no ids, so one that swaps words between two sections of a
	 * type looks like a move. It is let through as long as the sections are the
	 * same ones.
	 *
	 * @param object $post    The page as saved.
	 * @param string $content Content being saved.
	 * @return bool
	 */
	private static function restores( $post, $content ) {
		$now = self::read( $content );
		if ( self::relays( self::read( $post->post_content ), $now ) || self::without_ids( $content ) !== $content ) {
			return false;
		}
		if ( self::$restoring === (int) $post->ID ) {
			return true;
		}
		foreach ( wp_get_post_revisions( $post->ID, array( 'check_enabled' => false ) ) as $revision ) {
			// An autosave holds whatever was typed, checked or not.
			if ( ! wp_is_post_autosave( $revision ) && self::fingerprint( self::read( $revision->post_content ) ) === self::fingerprint( $now ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Refuses, with the message, to restore a revision with other sections.
	 *
	 * WordPress's restore link says it worked whatever a save does, so it has to
	 * be stopped before it starts.
	 *
	 * @return void
	 */
	public static function check_restore() {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- only reads; WordPress checks the link itself.
		if ( ! isset( $_REQUEST['action'], $_REQUEST['revision'] ) || 'restore' !== $_REQUEST['action'] ) {
			return;
		}
		$id       = (int) $_REQUEST['revision'];
		$revision = wp_get_post_revision( $id );
		// phpcs:enable
		// Someone who may not edit the page is not shown what a revision holds: WordPress says no itself.
		if ( ! $revision || ! self::applies( $revision->post_parent ) || ! current_user_can( 'edit_post', $revision->post_parent ) ) {
			return;
		}
		$post = get_post( $revision->post_parent );
		// An autosave holds whatever was typed, so its sections have to be where they were saved.
		if ( self::relays( self::read( $post->post_content ), self::read( $revision->post_content ) ) || ( wp_is_post_autosave( $revision ) && self::refuses( $post->post_content, $revision->post_content ) ) ) {
			wp_die( esc_html( self::message() ), '', array( 'response' => 403, 'back_link' => true ) );
		}
		self::$restoring = (int) $post->ID;
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
		if ( $existing && self::refuses( $existing->post_content, $prepared->post_content ) && ! self::restores( $existing, $prepared->post_content ) ) {
			return new \WP_Error( 'blueworx_page_locked', self::message(), array( 'status' => 403 ) );
		}
		return $prepared;
	}

	/**
	 * Lets a block hold its id on WordPress before 6.5, which is when WordPress
	 * gave every block metadata itself.
	 *
	 * @param array $args Block type settings.
	 * @return array
	 */
	public static function room_for_ids( $args ) {
		$attributes = isset( $args['attributes'] ) && is_array( $args['attributes'] ) ? $args['attributes'] : array();
		if ( ! isset( $attributes['metadata'] ) ) {
			$attributes['metadata'] = array( 'type' => 'object' );
			$args['attributes']     = $attributes;
		}
		return $args;
	}

	/**
	 * Gives whoever the lock holds the ids of the sections they are reading.
	 *
	 * @param object $response The response.
	 * @param object $post     The post.
	 * @return object
	 */
	public static function rest_ids( $response, $post ) {
		$data = $response->get_data();
		if ( isset( $data['content']['raw'] ) && self::applies( $post->ID ) ) {
			$data['content']['raw'] = self::with_ids( $data['content']['raw'] );
			$response->set_data( $data );
		}
		return $response;
	}

	/**
	 * Keeps a locked page's content on any save that is not REST, and takes the
	 * section ids off any page as it is saved.
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
			if ( $existing && self::refuses( $existing->post_content, $content ) && ! self::restores( $existing, $content ) ) {
				$data['post_content'] = wp_slash( $existing->post_content );
				self::$dropped        = $post_id;
				return $data;
			}
		}
		$type = isset( $data['post_type'] ) ? $data['post_type'] : '';
		if ( 'revision' === $type && ! empty( $data['post_parent'] ) ) {
			$type = get_post_type( $data['post_parent'] );
		}
		// An autosave is not the live page, and without ids a restore cannot tell sections that traded words from ones that moved.
		$autosave = 'revision' === ( isset( $data['post_type'] ) ? $data['post_type'] : '' ) && ! empty( $data['post_name'] ) && preg_match( '/^\d+-autosave-v\d+$/', $data['post_name'] );
		if ( self::covers( $type ) && ! $autosave ) {
			$saved = self::without_ids( $content );
			if ( $saved !== $content ) {
				$data['post_content'] = wp_slash( $saved );
			}
		}
		return $data;
	}

	/**
	 * Sends a person whose edit was put back to a page that says so, not to
	 * "Page updated".
	 *
	 * @param string $location Where the save sends the browser.
	 * @param int    $post_id  Post ID.
	 * @return string
	 */
	public static function redirect_post_location( $location, $post_id ) {
		if ( self::$dropped && self::$dropped === (int) $post_id ) {
			self::$dropped = 0;
			$location      = add_query_arg( 'blueworx_page_locked', '1', remove_query_arg( 'message', $location ) );
		}
		return $location;
	}

	/**
	 * Lets WordPress take the warning off the address, as it does for its own save messages.
	 *
	 * @param string[] $args Query arguments WordPress removes from the address.
	 * @return string[]
	 */
	public static function removable_query_args( $args ) {
		$args   = (array) $args;
		$args[] = 'blueworx_page_locked';
		return $args;
	}

	/**
	 * Says why the content was not saved, on the page a refused save sends the person to.
	 *
	 * @return void
	 */
	public static function notice() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- only shows a message.
		if ( empty( $_GET['blueworx_page_locked'] ) ) {
			return;
		}
		echo '<div class="notice notice-error"><p>' . esc_html( self::message() ) . '</p></div>';
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
