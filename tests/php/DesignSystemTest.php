<?php
use PHPUnit\Framework\TestCase;

final class DesignSystemTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		$GLOBALS['blueworx_admin_design_copies']         = [];
		$GLOBALS['blueworx_admin_design_enqueued']       = false;
		$GLOBALS['blueworx_admin_design_icons_enqueued'] = false;
	}

	public function test_highest_version_wins_regardless_of_registration_order() {
		blueworx_admin_design_register( '1.2.0', '/plugins/older/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '2.0.1', '/plugins/newer/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '1.10.0', '/plugins/middle/assets/blueworx-admin-design.php' );

		$this->assertSame( '2.0.1', blueworx_admin_design_version() );
		$this->assertSame( '/plugins/newer/assets/blueworx-admin-design.php', blueworx_admin_design_winner()['file'] );
	}

	public function test_ten_sorts_above_nine_not_alphabetically() {
		blueworx_admin_design_register( '1.9.0', '/plugins/a/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '1.10.0', '/plugins/b/assets/blueworx-admin-design.php' );

		$this->assertSame( '1.10.0', blueworx_admin_design_version() );
	}

	public function test_enqueues_the_winning_copy_once_under_the_shared_handle() {
		blueworx_admin_design_register( '1.0.0', '/plugins/older/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '2.0.0', '/plugins/newer/assets/blueworx-admin-design.php' );

		blueworx_admin_design_enqueue();
		blueworx_admin_design_enqueue();

		$styles = $GLOBALS['bwpe_stub_styles'];
		$this->assertCount( 1, $styles );
		$this->assertSame( 'blueworx-admin-design', $styles[0]['handle'] );
		$this->assertSame( 'https://example.test/plugins/newer/assets/blueworx-admin-design.css', $styles[0]['src'] );
		$this->assertSame( '2.0.0', $styles[0]['ver'] );
	}

	public function test_no_copies_registered_enqueues_nothing() {
		blueworx_admin_design_enqueue();

		$this->assertSame( [], $GLOBALS['bwpe_stub_styles'] );
		$this->assertSame( '', blueworx_admin_design_version() );
	}

	public function test_icons_module_is_enqueued_from_the_same_winning_copy() {
		blueworx_admin_design_register( '2.0.0', '/plugins/newer/assets/blueworx-admin-design.php' );

		blueworx_admin_design_enqueue_icons();

		$scripts = $GLOBALS['bwpe_stub_scripts'];
		$this->assertCount( 1, $scripts );
		$this->assertSame( 'blueworx-admin-design-icons', $scripts[0]['handle'] );
		$this->assertSame( 'https://example.test/plugins/newer/assets/blueworx-admin-icons.js', $scripts[0]['src'] );
	}

	public function test_a_copy_registering_twice_is_recorded_once() {
		blueworx_admin_design_register( '1.0.0', '/plugins/a/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '1.0.0', '/plugins/a/assets/blueworx-admin-design.php' );

		$this->assertCount( 1, $GLOBALS['blueworx_admin_design_copies'] );
	}
}
