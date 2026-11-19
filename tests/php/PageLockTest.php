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
