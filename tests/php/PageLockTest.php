<?php
namespace Blueworx\PageLock\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageLock\Registry;
use Blueworx\PageLock\v1\Lock;

final class PageLockTest extends TestCase {

	const HERO  = '<!-- wp:bwx/section-hero {"heading":"Hello"} /-->';
	const STEPS = '<!-- wp:bwx/section-steps {"items":[{"title":"One"}]} /-->';

	protected function setUp(): void {
		bwpe_stub_reset();
		$GLOBALS['bwpl_removed'] = [];
		$GLOBALS['bwpl_blocks']  = [];
		$GLOBALS['bwpl_revisions'] = [];
		$GLOBALS['bwpl_wpautop_fails'] = [];
		$restoring = new \ReflectionProperty( Lock::class, 'restoring' );
		$restoring->setAccessible( true );
		$restoring->setValue( null, 0 );
	}

	private function page( int $id, string $content, bool $locked = true ): object {
		$GLOBALS['bwpe_stub']['posts'][ $id ] = [ 'ID' => $id, 'post_type' => 'page', 'post_content' => $content ];
		if ( $locked ) {
			$GLOBALS['bwpe_stub']['meta'][ $id ][ Lock::META ] = '1';
		}
		return get_post( $id );
	}

	private function admin(): void {
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
	}

	// Shape.

	public function test_shape_ignores_words_and_attributes(): void {
		$this->assertSame(
			Lock::shape( self::HERO . self::STEPS ),
			Lock::shape( '<!-- wp:bwx/section-hero {"heading":"Changed"} /--><!-- wp:bwx/section-steps {"items":[{"title":"One"},{"title":"Two"}]} /-->' )
		);
	}

	public function test_shape_sees_order_and_nesting(): void {
		$this->assertNotSame( Lock::shape( self::HERO . self::STEPS ), Lock::shape( self::STEPS . self::HERO ) );
		$this->assertSame(
			[ [ 'core/group', [ [ 'core/paragraph', [] ] ] ] ],
			Lock::shape( '<!-- wp:group --><div><!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph --></div><!-- /wp:group -->' )
		);
	}

	public function test_an_empty_page_can_take_its_first_layout_once(): void {
		$this->assertFalse( Lock::refuses( '', self::HERO . self::STEPS ) );
		$this->assertTrue( Lock::refuses( self::HERO, self::HERO . self::STEPS ) );
		$this->assertTrue( Lock::refuses( self::HERO, '' ) );
		$this->assertFalse( Lock::refuses( self::HERO, '<!-- wp:bwx/section-hero {"heading":"New words"} /-->' ) );
	}

	// Markup outside the sections.

	public function test_markup_added_outside_the_sections_is_refused(): void {
		$page = self::HERO . "\n\n" . self::STEPS;
		$this->assertTrue( Lock::refuses( $page, '<p>Before</p>' . $page ) );
		$this->assertTrue( Lock::refuses( $page, self::HERO . '<p>Between</p>' . self::STEPS ) );
		$this->assertTrue( Lock::refuses( $page, $page . '<p>After</p>' ) );
		$this->assertFalse( Lock::refuses( $page, "\n" . self::HERO . "\n" . self::STEPS . "\n" ) );
	}

	public function test_rest_and_other_saves_refuse_markup_added_outside_the_sections(): void {
		$this->page( 1, self::HERO );
		$this->assertInstanceOf( \WP_Error::class, Lock::rest_guard( (object) [ 'ID' => 1, 'post_content' => self::HERO . '<p>After</p>' ] ) );
		$data = Lock::insert_guard( [ 'post_content' => wp_slash( self::HERO . '<p>After</p>' ) ], [ 'ID' => 1 ] );
		$this->assertSame( self::HERO, wp_unslash( $data['post_content'] ) );
	}

	public function test_words_already_outside_the_sections_can_still_change(): void {
		$page = '<p>An old introduction</p>' . self::HERO;
		$this->assertFalse( Lock::refuses( $page, '<p>A new introduction</p>' . self::HERO ) );
		$this->assertFalse( Lock::refuses( $page, '<p>An old introduction</p><!-- wp:bwx/section-hero {"heading":"New"} /-->' ) );
		$this->assertTrue( Lock::refuses( $page, $page . '<p>More</p>' ) );
	}

	public function test_nothing_is_added_beside_words_already_outside_the_sections(): void {
		$old = '<p>An old introduction</p>';
		foreach (
			[
				$old . '<p>Another paragraph</p>',
				'<h2>A heading</h2>' . $old,
				$old . '<img src="x.jpg">',
				$old . '<a href="/buy">Buy</a>',
				$old . "\n\nBare words",
				'<div>An old introduction</div>',
				'<p>An old introduction<iframe src="x"></iframe></p>',
				'<p>An old introduction<!-- </p>',
				'',
			] as $now
		) {
			$this->assertTrue( Lock::refuses( $old . self::HERO, $now . self::HERO ), $now );
		}
	}

	public function test_words_outside_the_sections_can_be_reworded_linked_and_made_bold(): void {
		$old = '<div><p>An old introduction</p><img src="a.jpg"></div>';
		foreach (
			[
				'<div><p>All new</p><img src="b.jpg" alt="B"></div>',
				'<div><p class="x">An <strong>old</strong><br><a href="/">introduction</a></p><img src="a.jpg"></div>',
				"<div>\n<p>An old introduction</p>\n<img src='a.jpg' />\n</div>",
				'<!-- a note with <p> in it --><div><p>An old introduction</p><img src="a.jpg"></div>',
			] as $now
		) {
			$this->assertFalse( Lock::refuses( $old . self::HERO, $now . self::HERO ), $now );
		}
	}

	public function test_the_editor_adding_paragraph_tags_to_plain_words_is_not_a_change(): void {
		// The block editor does this to a page's plain words as it opens it.
		$this->assertFalse( Lock::refuses( "First words\n\nSecond words\n" . self::HERO, "<p>First words</p>\n<p>Second, edited</p>\n\n" . self::HERO ) );
		$this->assertTrue( Lock::refuses( "First words\n\n" . self::HERO, "<p>First words</p>\n<p>A second</p>\n\n" . self::HERO ) );
	}

	public function test_line_breaks_are_part_of_the_words_they_sit_in(): void {
		foreach (
			[
				[ '<p>Hello world</p>', '<p>Hello<br><br>world</p>' ],
				[ '<p>Hello<br /><br />world</p>', '<p>Hello world</p>' ],
				[ '<div>Hello world</div>', '<div>Hello<br><br>world</div>' ],
				// As the block editor rewrites them by opening the page.
				[ '<p>Hello<br><br>world</p>', '<p>Hello</p><p>world, edited</p>' ],
				[ 'Hello<br><br>world', '<p>Hello</p><p>world, edited</p>' ],
				[ '<p>Hello</p><br><br><p>world</p>', '<p>Hello</p><p>world, edited</p>' ],
			] as $edit
		) {
			$this->assertFalse( Lock::refuses( $edit[0] . self::HERO, $edit[1] . self::HERO ), $edit[1] );
		}
	}

	public function test_line_breaks_of_their_own_are_not_words(): void {
		$old = '<p>Hello</p>';
		foreach ( [ $old . '<br>', $old . '<br/><br/>', '<br><br>' . $old, $old . '<p><br></p>' ] as $now ) {
			$this->assertTrue( Lock::refuses( $old . self::HERO, $now . self::HERO ), $now );
		}
		$this->assertTrue( Lock::refuses( self::HERO, self::HERO . '<br>' ) );
		$this->assertFalse( Lock::refuses( $old . '<br><br>' . self::HERO, '<p>Edited</p><br><br>' . self::HERO ) );
	}

	public function test_words_inside_a_block_can_change(): void {
		$this->assertFalse(
			Lock::refuses(
				'<!-- wp:group --><div><!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph --></div><!-- /wp:group -->',
				'<!-- wp:group --><div><!-- wp:paragraph --><p>Hello there</p><!-- /wp:paragraph --></div><!-- /wp:group -->'
			)
		);
	}

	public function test_a_section_wordpress_would_not_read_as_one_counts_as_removed(): void {
		$this->assertTrue( Lock::refuses( self::HERO, '<!-- wp:bwx/section-hero {"heading":"Hello"}/-->' ) );
		$this->assertTrue( Lock::refuses( self::HERO . self::STEPS, self::HERO . '<!-- /wp:group -->' . self::STEPS ) );
	}

	// Which section is which.

	private static function hero( string $heading, string $id = '' ): string {
		return '<!-- wp:bwx/section-hero {"heading":"' . $heading . '"' . ( '' === $id ? '' : ',"metadata":{"blueworxSection":"' . $id . '"}' ) . '} /-->';
	}

	public function test_swapping_two_sections_of_one_type_is_refused(): void {
		$page = self::hero( 'Celebration' ) . self::STEPS . self::hero( 'Dress code' );
		$this->assertTrue( Lock::refuses( $page, self::hero( 'Dress code' ) . self::STEPS . self::hero( 'Celebration' ) ) );
		$this->assertTrue(
			Lock::refuses(
				self::hero( 'A' ) . self::hero( 'B' ) . self::hero( 'C' ),
				self::hero( 'A, edited' ) . self::hero( 'C' ) . self::hero( 'B' )
			)
		);
		$this->assertTrue(
			Lock::refuses(
				'<!-- wp:group --><div>' . self::hero( 'A' ) . self::hero( 'B' ) . '</div><!-- /wp:group -->',
				'<!-- wp:group --><div>' . self::hero( 'B' ) . self::hero( 'A' ) . '</div><!-- /wp:group -->'
			)
		);
	}

	public function test_a_swap_is_seen_however_the_tool_writes_its_json(): void {
		$page = '<!-- wp:bwx/section-hero {"heading":"A","text":"x"} /--><!-- wp:bwx/section-hero {"heading":"B \u0026 C","text":"y"} /-->';
		$this->assertTrue( Lock::refuses( $page, '<!-- wp:bwx/section-hero {"text": "y", "heading": "B & C"} /--><!-- wp:bwx/section-hero {"text": "x", "heading": "A"} /-->' ) );
	}

	public function test_a_page_saved_before_section_ids_takes_any_edit_to_its_words(): void {
		$page = self::hero( 'Celebration' ) . self::hero( 'Dress code' ) . self::hero( 'Transport' );
		foreach (
			[
				[ 'Celebration, edited', 'Dress code', 'Transport' ],
				[ 'All', 'New', 'Words' ],
				[ 'Dress code', 'Dress code', 'Transport' ],
				[ 'Dress code', 'Dress code, rewritten', 'Transport' ],
				[ '', '', '' ],
			] as $words
		) {
			$after = self::hero( $words[0] ) . self::hero( $words[1] ) . self::hero( $words[2] );
			$this->assertFalse( Lock::refuses( $page, $after ), implode( ' / ', $words ) );
		}
		$same = self::hero( 'Same' ) . self::hero( 'Same' );
		$this->assertFalse( Lock::refuses( $same, $same ) );
	}

	public function test_a_moved_section_is_refused_even_when_its_words_change_too(): void {
		$page = self::hero( 'Celebration' ) . self::hero( 'Dress code' );
		$this->assertTrue( Lock::refuses( $page, self::hero( 'Dress code, edited', '1' ) . self::hero( 'Celebration', '0' ) ) );
		$this->assertTrue( Lock::refuses( $page, self::hero( 'Dress code, edited', '1' ) . self::hero( 'Celebration' ) ) );
	}

	public function test_words_swapped_between_sections_that_stayed_put_are_saved(): void {
		$page = self::hero( 'Celebration' ) . self::hero( 'Dress code' );
		$this->assertFalse( Lock::refuses( $page, self::hero( 'Dress code', '0' ) . self::hero( 'Celebration', '1' ) ) );
	}

	public function test_an_id_from_somewhere_else_is_ignored(): void {
		$this->assertFalse( Lock::refuses( self::hero( 'A' ) . self::hero( 'B' ), self::hero( 'A2', '7' ) . self::hero( 'B2', '7.1' ) ) );
		$this->assertFalse( Lock::refuses( self::HERO, '<!-- wp:bwx/section-hero {"metadata":{"blueworxSection":["0"]}} /-->' ) );
		$this->assertFalse( Lock::refuses( self::HERO, '<!-- wp:bwx/section-hero {"metadata":"0"} /-->' ) );
	}

	public function test_an_id_saved_in_a_page_never_makes_it_unsaveable(): void {
		$this->assertFalse( Lock::refuses( self::hero( 'A', '1' ) . self::hero( 'B', '0' ), self::hero( 'A, edited', '1' ) . self::hero( 'B', '0' ) ) );
	}

	public function pages_to_read(): array {
		return [
			'sections'                => [ self::HERO . "\n\n" . self::STEPS ],
			'nested, and no settings' => [ '<!-- wp:bwx/opening /--><!-- wp:group --><div>' . self::HERO . '</div><!-- /wp:group -->' ],
			'a renamed section'       => [ '<!-- wp:bwx/section-hero {"metadata":{"name":"Top"},"list":{},"words":"It\u0022s \u002d\u002d {fine}"} /-->' ],
			'words beside sections'   => [ '<p>Old</p>' . self::HERO . '<p>Old</p>' ],
		];
	}

	/**
	 * @dataProvider pages_to_read
	 */
	public function test_a_client_reads_the_ids_and_saving_takes_them_off_again( string $content ): void {
		$this->page( 1, $content );
		$read = Lock::with_ids( $content );
		$this->assertStringContainsString( '"blueworxSection":"0"', $read );
		$this->assertFalse( Lock::refuses( $content, $read ) );
		$data = Lock::insert_guard( [ 'post_type' => 'page', 'post_content' => wp_slash( $read ) ], [ 'ID' => 1 ] );
		$this->assertSame( $content, wp_unslash( $data['post_content'] ) );
	}

	public function test_a_nested_section_gets_an_id_of_its_own(): void {
		$this->assertStringContainsString(
			'"blueworxSection":"1.0"',
			Lock::with_ids( '<!-- wp:bwx/opening /--><!-- wp:group --><div>' . self::HERO . '</div><!-- /wp:group -->' )
		);
	}

	public function test_ids_come_off_however_the_tool_writes_its_json(): void {
		$this->assertSame( '<!-- wp:bwx/a {"b": 1} /-->', Lock::without_ids( '<!-- wp:bwx/a {"metadata": {"blueworxSection": "0"}, "b": 1} /-->' ) );
		foreach ( [ '{"metadata":null}', '{"metadata":{}}', '{"metadata":"x"}' ] as $attrs ) {
			$this->assertSame( '<!-- wp:bwx/a ' . $attrs . ' /-->', Lock::without_ids( Lock::with_ids( '<!-- wp:bwx/a ' . $attrs . ' /-->' ) ) );
		}
		$this->assertSame( '<!-- wp:bwx/a {"metadata":{"name":"N"}} /-->', Lock::without_ids( '<!-- wp:bwx/a {"metadata":{"blueworxSection":"0","name":"N"}} /-->' ) );
	}

	public function test_words_that_mention_an_id_are_left_alone(): void {
		$words = '<!-- wp:bwx/a {"b":"\"blueworxSection\":\"0\""} /--><p>,"blueworxSection":"0"</p>';
		$this->assertSame( $words, Lock::without_ids( $words ) );
	}

	public function test_only_an_id_the_lock_gave_out_comes_off(): void {
		foreach (
			[
				'{"items":[{"blueworxSection":"0"},{"metadata":{"blueworxSection":"0"}}]}',
				'{"blueworxSection":"0"}',
				'{"settings":{"metadata":{"blueworxSection":"1.2"}}}',
				'{"metadata":{"blueworxSection":"hero"}}',
				'{"metadata":{"blueworxSection":["0"]}}',
				'{"metadata":{"blueworxSection":0}}',
			] as $attrs
		) {
			$content = '<!-- wp:other/block ' . $attrs . ' /-->';
			$this->assertSame( $content, Lock::without_ids( $content ) );
		}
		// The id comes off and everything else stays to the letter.
		foreach (
			[
				'{"items":[{"blueworxSection":"0"},{"metadata":{"blueworxSection":"0"}}],"big":12345678901234567890,"n":1.0,"o":{}}',
				'{"metadata":{"name":"Top","x":[{"blueworxSection":"0"}]},"n":1.50}',
			] as $attrs
		) {
			$content = '<!-- wp:other/block ' . $attrs . ' /-->';
			$this->assertNotSame( $content, Lock::with_ids( $content ) );
			$this->assertSame( $content, Lock::without_ids( Lock::with_ids( $content ) ) );
		}
	}

	// Revisions.

	private function revisions( string ...$contents ): void {
		$GLOBALS['bwpl_revisions'] = [];
		foreach ( $contents as $i => $content ) {
			$id = 50 + $i;
			$GLOBALS['bwpl_revisions'][ $id ] = (object) [ 'ID' => $id, 'post_type' => 'revision', 'post_parent' => 1, 'post_name' => '1-revision-v1', 'post_content' => $content ];
		}
	}

	private function restore( string $content ): string {
		$data = Lock::insert_guard( [ 'post_type' => 'page', 'post_content' => wp_slash( $content ) ], [ 'ID' => 1 ] );
		return wp_unslash( $data['post_content'] );
	}

	public function test_restoring_a_revision_brings_its_words_back(): void {
		$old = self::hero( 'Celebration' ) . self::hero( 'Dress code' );
		$this->page( 1, self::hero( 'Dress code' ) . self::hero( 'Celebration' ) );
		$this->assertNotSame( $old, $this->restore( $old ), 'not a revision' );
		$this->revisions( $old );
		$this->assertSame( $old, $this->restore( $old ) );
		$prepared = (object) [ 'ID' => 1, 'post_content' => $old ];
		$this->assertSame( $prepared, Lock::rest_guard( $prepared ) );
	}

	public function test_a_section_known_to_have_moved_is_refused_whatever_the_revisions_say(): void {
		$old = self::hero( 'Celebration' ) . self::hero( 'Dress code' );
		$this->page( 1, self::hero( 'Dress code' ) . self::hero( 'Celebration' ) );
		$this->revisions( $old );
		$moved = self::hero( 'Celebration', '1' ) . self::hero( 'Dress code', '0' );
		$this->assertInstanceOf( \WP_Error::class, Lock::rest_guard( (object) [ 'ID' => 1, 'post_content' => $moved ] ) );
	}

	public function test_an_autosave_is_not_a_revision_to_restore(): void {
		$page = self::hero( 'Celebration' ) . self::hero( 'Dress code' );
		$this->page( 1, $page );
		$this->revisions( self::hero( 'Dress code' ) . self::hero( 'Celebration' ) );
		$GLOBALS['bwpl_revisions'][50]->post_name = '1-autosave-v1';
		$this->assertSame( $page, $this->restore( self::hero( 'Dress code' ) . self::hero( 'Celebration' ) ) );
	}

	public function test_a_revision_with_other_sections_is_refused_out_loud(): void {
		$this->page( 1, self::HERO );
		$this->revisions( self::HERO . self::STEPS, self::hero( 'Old words' ) );
		$_REQUEST = [ 'action' => 'restore', 'revision' => '50' ];
		try {
			Lock::check_restore();
			$this->fail( 'the restore went ahead' );
		} catch ( \RuntimeException $e ) {
			$this->assertSame( Lock::message(), $e->getMessage() );
		}
		// Only its words differ, or the person may change the page: nothing to say.
		$_REQUEST['revision'] = '51';
		Lock::check_restore();
		$_REQUEST['revision'] = '50';
		$this->admin();
		Lock::check_restore();
		$_REQUEST = [];
	}

	public function test_another_post_type_is_never_altered(): void {
		$content = Lock::with_ids( self::HERO );
		foreach ( [ 'post', 'product', 'wp_block' ] as $type ) {
			$data = [ 'post_type' => $type, 'post_content' => wp_slash( $content ) ];
			$this->assertSame( $data, Lock::insert_guard( $data, [ 'ID' => 7 ] ) );
		}
		// A page's autosave and revisions are the page's.
		$this->page( 1, self::HERO );
		$data = Lock::insert_guard( [ 'post_type' => 'revision', 'post_parent' => 1, 'post_content' => wp_slash( $content ) ], [ 'ID' => 0 ] );
		$this->assertSame( self::HERO, wp_unslash( $data['post_content'] ) );
	}

	public function test_ids_never_stay_in_a_saved_page_whoever_saves_it(): void {
		$this->admin();
		$this->page( 1, self::HERO );
		$read = Lock::with_ids( self::HERO . self::STEPS );
		foreach ( [ [ 'ID' => 1 ], [], [ 'ID' => 99 ] ] as $postarr ) {
			$data = Lock::insert_guard( [ 'post_type' => 'page', 'post_content' => wp_slash( $read ) ], $postarr );
			$this->assertSame( self::HERO . self::STEPS, wp_unslash( $data['post_content'] ) );
		}
	}

	public function test_every_block_can_hold_its_id_on_an_older_wordpress(): void {
		$this->assertSame( [ 'attributes' => [ 'metadata' => [ 'type' => 'object' ] ] ], Lock::room_for_ids( [] ) );
		$this->assertSame( [ 'attributes' => [ 'metadata' => [ 'type' => 'object' ] ] ], Lock::room_for_ids( [ 'attributes' => null ] ) );
		$own = [ 'attributes' => [ 'heading' => [ 'type' => 'string' ], 'metadata' => [ 'type' => 'string' ] ] ];
		$this->assertSame( $own, Lock::room_for_ids( $own ) );
	}

	public function test_only_someone_held_by_the_lock_is_given_the_ids(): void {
		$response = new class() {
			public $data = [];
			public function get_data() {
				return $this->data;
			}
			public function set_data( $data ) {
				$this->data = $data;
			}
		};
		$post           = $this->page( 1, self::HERO );
		$response->data = [ 'content' => [ 'raw' => self::HERO ] ];
		$this->assertSame( Lock::with_ids( self::HERO ), Lock::rest_ids( $response, $post )->data['content']['raw'] );

		$response->data = [ 'content' => [ 'rendered' => '<p>Hi</p>' ] ];
		$this->assertSame( [ 'content' => [ 'rendered' => '<p>Hi</p>' ] ], Lock::rest_ids( $response, $post )->data );

		$this->admin();
		$response->data = [ 'content' => [ 'raw' => self::HERO ] ];
		$this->assertSame( self::HERO, Lock::rest_ids( $response, $post )->data['content']['raw'] );
	}

	// Findings left open on the pull requests that carry the lock.

	public function test_a_save_that_is_thrown_away_does_not_say_it_worked(): void {
		$this->page( 1, self::HERO );
		$this->page( 2, self::HERO );
		$data = Lock::insert_guard( [ 'post_content' => wp_slash( self::HERO . self::STEPS ) ], [ 'ID' => 1 ] );
		$this->assertSame( self::HERO, wp_unslash( $data['post_content'] ) );

		$location = Lock::redirect_post_location( 'https://site.test/wp-admin/post.php?post=2&action=edit&message=1', 2 );
		$this->assertStringContainsString( 'message=1', $location, 'another page is left alone' );

		$location = Lock::redirect_post_location( 'https://site.test/wp-admin/post.php?post=1&action=edit&message=1', 1 );
		$this->assertStringNotContainsString( 'message=1', $location );
		$this->assertStringContainsString( 'blueworx_page_locked=1', $location );

		// Said once: the next save is its own.
		$this->assertStringContainsString( 'message=1', Lock::redirect_post_location( 'https://site.test/wp-admin/post.php?post=1&message=1', 1 ) );

		// A save that kept every section is not thrown away.
		Lock::insert_guard( [ 'post_content' => wp_slash( self::hero( 'New words' ) ) ], [ 'ID' => 1 ] );
		$this->assertStringContainsString( 'message=1', Lock::redirect_post_location( 'https://site.test/wp-admin/post.php?post=1&message=1', 1 ) );
	}

	public function test_the_page_says_why_when_a_save_was_thrown_away(): void {
		$_GET = [ 'blueworx_page_locked' => '1' ];
		ob_start();
		Lock::notice();
		$html = ob_get_clean();
		$this->assertStringContainsString( 'notice-error', $html );
		$this->assertStringContainsString( htmlspecialchars( Lock::message() ), $html );
		$_GET = [];
		ob_start();
		Lock::notice();
		$this->assertSame( '', ob_get_clean() );
	}

	public function test_a_revision_is_not_read_for_someone_who_may_not_edit_the_page(): void {
		$this->page( 1, self::HERO );
		$this->revisions( self::HERO . self::STEPS );
		$GLOBALS['bwpe_stub']['edit_posts'][1] = false;
		$_REQUEST = [ 'action' => 'restore', 'revision' => '50' ];
		Lock::check_restore();
		$restoring = new \ReflectionProperty( Lock::class, 'restoring' );
		$restoring->setAccessible( true );
		$this->assertSame( 0, $restoring->getValue() );
		// Someone who may edit it is still told.
		$GLOBALS['bwpe_stub']['edit_posts'][1] = true;
		try {
			Lock::check_restore();
			$this->fail( 'the restore went ahead' );
		} catch ( \RuntimeException $e ) {
			$this->assertSame( Lock::message(), $e->getMessage() );
		} finally {
			$_REQUEST = [];
		}
	}

	public function test_an_attribute_is_not_an_element(): void {
		$old = '<p>An old introduction</p>' . self::HERO;
		foreach (
			[
				'<p title="<b>x</b> <div>">An old introduction</p>',
				"<p title='<div><iframe>'>An old introduction</p>",
				'<p title="a > b">An old introduction</p>',
				'<p data-x="<!--">An old introduction</p>',
			] as $now
		) {
			$this->assertFalse( Lock::refuses( $old, $now . self::HERO ), $now );
		}
		foreach (
			[
				'<p title="a > b"><iframe src="x"></iframe>An old introduction</p>',
				'<p title="x">An old introduction</p><div title="<p>"></div>',
				'<p title="x">An old introduction</p><iframe title=">"></iframe>',
			] as $now
		) {
			$this->assertTrue( Lock::refuses( $old, $now . self::HERO ), $now );
		}
	}

	public function test_a_very_long_attribute_does_not_hide_the_layout(): void {
		$long = str_repeat( 'a', 3000000 );
		$old  = '<p data-x=' . $long . '>An old introduction</p>' . self::HERO;
		$this->assertFalse( Lock::refuses( $old, '<p data-x=' . $long . '>Reworded</p>' . self::HERO ) );
		$this->assertTrue( Lock::refuses( $old, '<p data-x=' . $long . '>An old introduction</p><iframe src="x"></iframe>' . self::HERO ) );
		$quoted = '<p title="' . $long . '">An old introduction</p>' . self::HERO;
		$this->assertTrue( Lock::refuses( $quoted, $quoted . '<iframe src="x"></iframe>' ) );
	}

	public function test_markup_that_cannot_be_read_is_refused_unless_it_is_unchanged(): void {
		$old = '<p ' . str_repeat( '"a" ', 5000 ) . '>An old introduction</p>' . self::HERO;
		ini_set( 'pcre.backtrack_limit', '1000' );
		ini_set( 'pcre.jit', '0' );
		try {
			$this->assertTrue( Lock::refuses( $old, $old . '<iframe src="x"></iframe>' ) );
			$this->assertFalse( Lock::refuses( $old, $old ) );
		} finally {
			ini_set( 'pcre.backtrack_limit', '1000000' );
			ini_set( 'pcre.jit', '1' );
		}
	}

	public function test_markup_wordpress_cannot_tidy_does_not_read_as_empty(): void {
		$GLOBALS['bwpl_wpautop_fails'] = [ 'BIGSVG' ];
		$old = '<p>An old introduction BIGSVG</p>' . self::HERO;
		$this->assertTrue( Lock::refuses( $old, '<p>An old introduction BIGSVG</p><iframe src="x"></iframe>' . self::HERO ) );
		$this->assertTrue( Lock::refuses( '<p>Intro</p>' . self::HERO, '<p>Intro</p><div>BIGSVG</div>' . self::HERO ) );
		$this->assertFalse( Lock::refuses( $old, $old ) );
	}

	public function test_words_beside_a_large_inline_svg_can_still_be_edited(): void {
		// The SVG is what WordPress cannot tidy.
		$GLOBALS['bwpl_wpautop_fails'] = [ 'BIGSVG' ];
		$old = '<p>An old introduction <svg viewBox="0 0 9 9"><path d="BIGSVG"/></svg></p>' . self::HERO;
		$this->assertFalse( Lock::refuses( $old, str_replace( 'old introduction', 'new words', $old ) ) );
		$this->assertTrue( Lock::refuses( $old, $old . '<iframe src="x"></iframe>' ) );
		$this->assertTrue( Lock::refuses( $old, str_replace( '</p>', '</p><iframe src="x"></iframe>', $old ) ) );
		$this->assertTrue( Lock::refuses( $old, str_replace( '<path d="BIGSVG"/>', '<path d="BIGSVG"/><script></script>', $old ) ) );
	}

	public function test_paragraphs_beside_a_large_inline_svg_are_read_as_anywhere_else(): void {
		$GLOBALS['bwpl_wpautop_fails'] = [ 'BIGSVG' ];
		$svg   = '<svg viewBox="0 0 9 9"><path d="BIGSVG"/></svg>';
		$loose = 'Intro words ' . $svg;
		// Paragraph tags round loose words, as the editor adds them, are not a change.
		$this->assertFalse( Lock::refuses( $loose . self::HERO, '<p>' . $loose . '</p>' . self::HERO ) );
		$this->assertFalse( Lock::refuses( '<p>' . $loose . '</p>' . self::HERO, $loose . self::HERO ) );
		$this->assertTrue( Lock::refuses( $loose . self::HERO, '<p>' . $loose . '</p><iframe src="x"></iframe>' . self::HERO ) );
		// A whole paragraph added or taken away is.
		$this->assertTrue( Lock::refuses( '<p>' . $loose . '</p>' . self::HERO, '<p>' . $loose . '</p><p>More</p>' . self::HERO ) );
		$this->assertTrue( Lock::refuses( '<p>' . $loose . '</p><p>More</p>' . self::HERO, '<p>' . $loose . '</p>' . self::HERO ) );
		// The same SVG moved to another place is not the same elements.
		$this->assertTrue( Lock::refuses( '<div>One</div><div>Two ' . $svg . '</div>' . self::HERO, '<div>One ' . $svg . '</div><div>Two</div>' . self::HERO ) );
	}

	public function test_a_text_edit_that_pushes_an_svg_past_the_limit_is_not_refused(): void {
		$GLOBALS['bwpl_wpautop_fails'] = [ 'BIGSVG' ];
		$old = '<p>Intro <svg viewBox="0 0 9 9"><path d="M0 0"/></svg></p>' . self::HERO;
		$this->assertFalse( Lock::refuses( $old, str_replace( 'M0 0', 'BIGSVG', $old ) ) );
		$this->assertFalse( Lock::refuses( str_replace( 'M0 0', 'BIGSVG', $old ), $old ) );
	}

	public function test_a_line_break_written_inside_an_attribute_does_not_hide_the_closing_tag(): void {
		$old = '<div title="x <br y">Hello</div><div class="a">More</div>' . self::HERO;
		$this->assertFalse( Lock::refuses( $old, '<div title="x <br y">Hello "there</div><div class="a">More</div>' . self::HERO ) );
		$this->assertTrue( Lock::refuses( $old, '<div title="x <br y">Hello "there</div><div class="a">More</div><iframe src="x"></iframe>' . self::HERO ) );
	}

	public function test_an_autosave_keeps_section_ids_so_it_can_be_checked_and_restored(): void {
		$page = '<!-- wp:bwx/section-hero {"heading":"X","body":"B"} /--><!-- wp:bwx/section-hero {"heading":"Y","body":"B"} /-->';
		$this->page( 1, $page );
		// Headings swapped in place: the sections did not move.
		$edited = '<!-- wp:bwx/section-hero {"heading":"Y","body":"B","metadata":{"blueworxSection":"0"}} /--><!-- wp:bwx/section-hero {"heading":"X","body":"B","metadata":{"blueworxSection":"1"}} /-->';
		$data   = Lock::insert_guard( [ 'post_type' => 'revision', 'post_name' => '1-autosave-v1', 'post_parent' => 1, 'post_content' => wp_slash( $edited ) ], [ 'ID' => 0 ] );
		$this->assertSame( $edited, wp_unslash( $data['post_content'] ) );
		// An ordinary revision still has them taken off.
		$data = Lock::insert_guard( [ 'post_type' => 'revision', 'post_name' => '1-revision-v1', 'post_parent' => 1, 'post_content' => wp_slash( $edited ) ], [ 'ID' => 0 ] );
		$this->assertSame( Lock::without_ids( $edited ), wp_unslash( $data['post_content'] ) );
		$this->revisions( $edited );
		$GLOBALS['bwpl_revisions'][50]->post_name = '1-autosave-v1';
		$_REQUEST = [ 'action' => 'restore', 'revision' => '50' ];
		Lock::check_restore();
		// Ids that say the sections moved still stop it.
		$GLOBALS['bwpl_revisions'][50]->post_content = '<!-- wp:bwx/section-hero {"heading":"Y","body":"B","metadata":{"blueworxSection":"1"}} /--><!-- wp:bwx/section-hero {"heading":"X","body":"B","metadata":{"blueworxSection":"0"}} /-->';
		try {
			Lock::check_restore();
			$this->fail( 'the restore went ahead' );
		} catch ( \RuntimeException $e ) {
			$this->assertSame( Lock::message(), $e->getMessage() );
		}
		$_REQUEST = [];
	}

	public function test_words_can_change_when_only_the_second_reading_of_the_old_markup_fails(): void {
		// The old markup read as the editor redraws it matches; reading it as saved is what fails.
		$break = '<br ' . str_repeat( '"a" ', 5000 ) . '>';
		$old   = '<p>Hello' . $break . 'world</p>' . self::HERO;
		ini_set( 'pcre.backtrack_limit', '1000' );
		ini_set( 'pcre.jit', '0' );
		try {
			$this->assertFalse( Lock::refuses( $old, '<p>Hello' . $break . 'edited</p>' . self::HERO ) );
			$this->assertTrue( Lock::refuses( $old, '<p>Hello' . $break . 'edited</p><iframe src="x"></iframe>' . self::HERO ) );
		} finally {
			ini_set( 'pcre.backtrack_limit', '1000000' );
			ini_set( 'pcre.jit', '1' );
		}
	}

	public function test_the_save_warning_is_cleared_from_the_address(): void {
		$this->assertContains( 'blueworx_page_locked', Lock::removable_query_args( [ 'message' ] ) );
		$this->assertContains( 'message', Lock::removable_query_args( [ 'message' ] ) );
	}

	public function test_an_autosave_cannot_be_restored_to_move_sections(): void {
		$page = self::hero( 'Celebration' ) . self::hero( 'Dress code' );
		$this->page( 1, $page );
		$this->revisions( self::hero( 'Dress code' ) . self::hero( 'Celebration' ) );
		$GLOBALS['bwpl_revisions'][50]->post_name = '1-autosave-v1';
		$_REQUEST = [ 'action' => 'restore', 'revision' => '50' ];
		try {
			Lock::check_restore();
			$this->fail( 'the restore went ahead' );
		} catch ( \RuntimeException $e ) {
			$this->assertSame( Lock::message(), $e->getMessage() );
		}
		// An autosave that only has other words is still restored.
		$GLOBALS['bwpl_revisions'][50]->post_content = self::hero( 'Celebration, edited' ) . self::hero( 'Dress code' );
		Lock::check_restore();
		$_REQUEST = [];
	}

	public function test_a_closing_marker_that_closes_itself_is_a_section_as_wordpress_reads_it(): void {
		$this->assertSame( [ [ 'bwx/a', [] ] ], Lock::shape( '<!-- /wp:bwx/a /-->' ) );
		$this->assertSame(
			[ [ 'core/group', [ [ 'bwx/a', [] ] ] ], [ 'bwx/b', [] ] ],
			Lock::shape( '<!-- wp:group --><div><!-- /wp:bwx/a /--></div><!-- /wp:group --><!-- wp:bwx/b /-->' )
		);
		$this->assertTrue( Lock::refuses( self::HERO, self::HERO . '<!-- /wp:bwx/section-steps /-->' ) );
		$this->assertTrue( Lock::refuses( self::HERO . self::STEPS, self::HERO . '<!-- /wp:bwx/section-steps /-->' . self::STEPS ) );
		// A closer with settings is still only a closer.
		$this->assertSame( [], Lock::shape( '<!-- /wp:bwx/a {"x":1} -->' ) );
	}

	public function test_a_section_with_empty_settings_is_given_an_id(): void {
		$content = '<!-- wp:bwx/a {} /--><!-- wp:bwx/a { } /-->';
		$read    = Lock::with_ids( $content );
		$this->assertStringContainsString( '"blueworxSection":"0"', $read );
		$this->assertStringContainsString( '"blueworxSection":"1"', $read );
		$this->assertSame( '<!-- wp:bwx/a /--><!-- wp:bwx/a /-->', Lock::without_ids( $read ) );
		$this->assertFalse( Lock::refuses( $content, $read ) );
		// Sections traded between two places are seen as moved, because the ids say so.
		$page = '<!-- wp:bwx/a {} /--><!-- wp:bwx/a {"x":"1"} /-->';
		$this->assertTrue( Lock::refuses( $page, '<!-- wp:bwx/a {"x":"1","metadata":{"blueworxSection":"1"}} /--><!-- wp:bwx/a {"metadata":{"blueworxSection":"0"}} /-->' ) );
	}

	// Who the lock applies to.

	public function test_applies_to_a_client_on_a_locked_page(): void {
		$this->page( 1, self::HERO );
		$this->assertTrue( Lock::applies( 1 ) );
	}

	public function test_does_not_apply_to_an_administrator(): void {
		$this->page( 1, self::HERO );
		$this->admin();
		$this->assertFalse( Lock::applies( 1 ) );
	}

	public function test_does_not_apply_to_an_unlocked_page_or_a_post(): void {
		$this->page( 1, self::HERO, false );
		$GLOBALS['bwpe_stub']['posts'][2] = [ 'ID' => 2, 'post_type' => 'post', 'post_content' => self::HERO ];
		$GLOBALS['bwpe_stub']['meta'][2][ Lock::META ] = '1';
		$this->assertFalse( Lock::applies( 1 ) );
		$this->assertFalse( Lock::applies( 2 ) );
	}

	// Saves.

	public function test_rest_refuses_a_new_section_with_a_message(): void {
		$this->page( 1, self::HERO );
		$result = Lock::rest_guard( (object) [ 'ID' => 1, 'post_content' => self::HERO . self::STEPS ] );
		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertArrayHasKey( 'blueworx_page_locked', $result->errors );
	}

	public function test_rest_lets_words_change(): void {
		$this->page( 1, self::HERO );
		$prepared = (object) [ 'ID' => 1, 'post_content' => '<!-- wp:bwx/section-hero {"heading":"New"} /-->' ];
		$this->assertSame( $prepared, Lock::rest_guard( $prepared ) );
	}

	public function test_other_saves_keep_the_sections(): void {
		$this->page( 1, self::HERO );
		$data = Lock::insert_guard( [ 'post_content' => wp_slash( self::HERO . self::STEPS ), 'post_title' => 'New title' ], [ 'ID' => 1 ] );
		$this->assertSame( self::HERO, wp_unslash( $data['post_content'] ) );
		$this->assertSame( 'New title', $data['post_title'] );
	}

	// The flag.

	public function test_a_new_page_is_locked_by_whoever_creates_it(): void {
		$post = $this->page( 5, '', false );
		Lock::lock_new_page( 5, $post, false );
		$this->assertTrue( Lock::is_locked( 5 ) );
	}

	public function test_an_update_or_a_post_is_not_locked(): void {
		$page = $this->page( 5, '', false );
		Lock::lock_new_page( 5, $page, true );
		$post = (object) [ 'ID' => 6, 'post_type' => 'post' ];
		Lock::lock_new_page( 6, $post, false );
		$this->assertFalse( Lock::is_locked( 5 ) );
		$this->assertFalse( Lock::is_locked( 6 ) );
	}

	public function test_a_site_can_switch_off_locking_new_pages(): void {
		$GLOBALS['bwpe_stub']['filters']['blueworx_page_lock_new_pages'] = false;
		$post = $this->page( 5, '', false );
		Lock::lock_new_page( 5, $post, false );
		$this->assertFalse( Lock::is_locked( 5 ) );
	}

	public function test_only_an_administrator_can_write_the_flag(): void {
		$this->assertFalse( Lock::guard_meta( null, 1, Lock::META ) );
		$this->assertNull( Lock::guard_meta( null, 1, 'some_other_key' ) );
		$this->admin();
		$this->assertNull( Lock::guard_meta( null, 1, Lock::META ) );
	}

	// The editor.

	public function test_a_client_gets_no_code_view_and_a_locked_layout(): void {
		$post     = $this->page( 1, self::HERO );
		$settings = Lock::editor_settings( [], (object) [ 'post' => $post ] );
		$this->assertFalse( $settings['codeEditingEnabled'] );
		$this->assertSame( 'all', $settings['templateLock'] );
	}

	public function test_a_client_can_lay_out_an_empty_page(): void {
		$post     = $this->page( 1, '' );
		$settings = Lock::editor_settings( [], (object) [ 'post' => $post ] );
		$this->assertFalse( $settings['codeEditingEnabled'] );
		$this->assertArrayNotHasKey( 'templateLock', $settings );
	}

	public function test_an_administrator_gets_the_normal_editor(): void {
		$post = $this->page( 1, self::HERO );
		$this->admin();
		$this->assertSame( [], Lock::editor_settings( [], (object) [ 'post' => $post ] ) );
	}

	public function test_a_client_is_offered_only_section_blocks(): void {
		$GLOBALS['bwpl_blocks'] = [ 'core/paragraph', 'core/image', 'bwx/section-hero', 'bwx/section-steps' ];
		$post = $this->page( 1, '' );
		$this->assertSame( [ 'bwx/section-hero', 'bwx/section-steps' ], Lock::allowed_blocks( true, (object) [ 'post' => $post ] ) );
	}

	public function test_a_site_can_name_its_own_section_namespace(): void {
		$GLOBALS['bwpl_blocks'] = [ 'core/paragraph', 'surecart/buy-button', 'bwx/section-hero' ];
		$GLOBALS['bwpe_stub']['filters']['blueworx_page_lock_section_namespaces'] = [ 'bwx' ];
		$post = $this->page( 1, '' );
		$this->assertSame( [ 'bwx/section-hero' ], Lock::allowed_blocks( true, (object) [ 'post' => $post ] ) );
	}

	public function test_an_unlocked_page_offers_every_block(): void {
		$GLOBALS['bwpl_blocks'] = [ 'core/paragraph', 'bwx/section-hero' ];
		$post = $this->page( 1, '', false );
		$this->assertTrue( Lock::allowed_blocks( true, (object) [ 'post' => $post ] ) );
	}

	// Loading.

	public function test_the_highest_copy_wins(): void {
		Registry::add( '1.0.0', '/a' );
		Registry::add( '1.10.0', '/b' );
		Registry::add( '1.2.0', '/c' );
		$this->assertSame( '1.10.0', Registry::latest() );
	}

	public function test_the_folder_address_works_for_a_theme_or_a_plugin(): void {
		$this->assertSame(
			'https://site.test/wp-content/themes/blueworx/blueworx-page-lock/',
			Registry::url_for( 'C:\\site\\wp-content\\themes\\blueworx\\blueworx-page-lock', 'C:\\site\\wp-content', 'https://site.test/wp-content' )
		);
		$this->assertSame( '', Registry::url_for( '/elsewhere/blueworx-page-lock', '/site/wp-content', 'https://site.test/wp-content' ) );
	}

	public function test_the_theme_lock_is_switched_off_when_present(): void {
		if ( ! function_exists( 'blueworx_page_lock_shape' ) ) {
			eval( 'function blueworx_page_lock_shape() {}' );
		}
		Lock::retire_theme_lock();
		$this->assertContains( 'wp_insert_post_data|blueworx_page_lock_insert_guard', $GLOBALS['bwpl_removed'] );
		$this->assertContains( 'enqueue_block_editor_assets|blueworx_page_lock_editor_assets', $GLOBALS['bwpl_removed'] );
	}
}
