<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Sanitise;

final class SanitiseTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
	}

	public function test_text_loses_markup(): void {
		$this->assertSame( 'Rugby', Sanitise::field( [ 'kind' => 'text' ], '<b>Rugby</b>' ) );
	}

	public function test_richtext_keeps_the_five_things_it_allows(): void {
		$out = Sanitise::field( [ 'kind' => 'richtext' ], '<p>A <strong>club</strong> <script>bad()</script></p>' );
		$this->assertStringContainsString( '<strong>club</strong>', $out );
		$this->assertStringNotContainsString( 'script', $out );
	}

	public function test_a_number_outside_its_range_is_clamped(): void {
		$field = [ 'kind' => 'number', 'min' => 1, 'max' => 10 ];
		$this->assertSame( 10, Sanitise::field( $field, 99 ) );
		$this->assertSame( 1, Sanitise::field( $field, -5 ) );
	}

	public function test_a_choice_outside_its_options_becomes_empty(): void {
		$field = [ 'kind' => 'select', 'options' => [ [ 'value' => 'a', 'label' => 'A' ] ] ];
		$this->assertSame( '', Sanitise::field( $field, 'z' ) );
		$this->assertSame( 'a', Sanitise::field( $field, 'a' ) );
	}

	public function test_a_colour_must_be_a_hex_value(): void {
		$this->assertSame( '#4F46E5', Sanitise::field( [ 'kind' => 'colour' ], '#4F46E5' ) );
		$this->assertSame( '', Sanitise::field( [ 'kind' => 'colour' ], 'red; background:url(x)' ) );
	}

	public function test_tokens_are_cleaned_individually_and_deduplicated(): void {
		$out = Sanitise::field( [ 'kind' => 'tokens' ], [ 'under 12', '<b>under 12</b>', 'under 14' ] );
		$this->assertSame( [ 'under 12', 'under 14' ], $out );
	}

	public function test_a_repeater_cleans_every_cell_of_every_row(): void {
		$field = [ 'kind' => 'repeater', 'fields' => [
			[ 'id' => 'day', 'kind' => 'text' ],
			[ 'id' => 'seats', 'kind' => 'number', 'min' => 0, 'max' => 30 ],
		] ];
		$out = Sanitise::field( $field, [ [ 'day' => '<i>Monday</i>', 'seats' => 99, 'sneaky' => 'x' ] ] );
		$this->assertSame( [ [ 'day' => 'Monday', 'seats' => 30 ] ], $out );
	}
}
