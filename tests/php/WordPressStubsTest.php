<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;

final class WordPressStubsTest extends TestCase {
	public function test_wp_kses_post_strips_an_onerror_attribute_and_a_javascript_href_but_keeps_strong(): void {
		$dirty = '<img src="x.jpg" onerror="alert(1)"><a href="javascript:alert(1)">link</a><strong>keep me</strong>';

		$clean = wp_kses_post( $dirty );

		$this->assertStringNotContainsString( 'onerror', $clean );
		$this->assertStringNotContainsString( 'javascript:', $clean );
		$this->assertStringContainsString( '<strong>keep me</strong>', $clean );
	}
}
