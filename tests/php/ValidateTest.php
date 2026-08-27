<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Schema;
use Blueworx\PageEditor\v1\Validate;

final class ValidateTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
	}

	private function screen(): array {
		return Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name', 'required' => true ],
						[ 'id' => 'contact', 'kind' => 'text', 'label' => 'Contact email', 'format' => 'email' ],
						[ 'id' => 'label', 'kind' => 'text', 'label' => 'Short label', 'max_length' => 12 ],
					] ],
				] ],
			],
		] );
	}

	public function test_a_valid_record_returns_no_errors(): void {
		$errors = Validate::run( $this->screen(), [ 'name' => 'Rugby', 'contact' => 'dan@coastalbloom.co', 'label' => 'Rugby' ] );
		$this->assertSame( [], $errors );
	}

	public function test_a_missing_required_field_is_named(): void {
		$errors = Validate::run( $this->screen(), [ 'name' => '' ] );
		$this->assertArrayHasKey( 'name', $errors );
	}

	public function test_an_error_names_the_fix_rather_than_saying_invalid(): void {
		$errors = Validate::run( $this->screen(), [ 'name' => 'Rugby', 'contact' => 'dan' ] );
		$this->assertStringContainsString( 'domain', $errors['contact'] );
		$this->assertStringNotContainsString( 'Invalid', $errors['contact'] );
	}

	public function test_a_length_cap_is_enforced(): void {
		$errors = Validate::run( $this->screen(), [ 'name' => 'Rugby', 'label' => 'Far too long a label' ] );
		$this->assertStringContainsString( '12', $errors['label'] );
	}
}
