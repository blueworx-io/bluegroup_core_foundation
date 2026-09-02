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

	private function dependentScreen(): array {
		return Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce' ],
						[
							'id'         => 'announce_text',
							'kind'       => 'text',
							'label'      => 'Announcement',
							'required'   => true,
							'depends_on' => [ 'field' => 'announce', 'value' => true ],
						],
					] ],
				] ],
			],
		] );
	}

	public function test_a_dependent_field_whose_condition_holds_is_validated(): void {
		$errors = Validate::run( $this->dependentScreen(), [ 'announce' => true, 'announce_text' => '' ] );
		$this->assertArrayHasKey( 'announce_text', $errors );
	}

	public function test_a_dependent_field_whose_condition_is_false_is_skipped(): void {
		$errors = Validate::run( $this->dependentScreen(), [ 'announce' => false, 'announce_text' => '' ] );
		$this->assertArrayNotHasKey( 'announce_text', $errors );
	}

	public function test_a_checkbox_submission_of_1_satisfies_a_boolean_true_condition(): void {
		$errors = Validate::run( $this->dependentScreen(), [ 'announce' => '1', 'announce_text' => '' ] );
		$this->assertArrayHasKey( 'announce_text', $errors );
	}

	public function test_a_dependency_on_an_unknown_field_is_validated_rather_than_skipped(): void {
		// Built by hand, bypassing Schema::validate(), the way Task 12's second
		// schema is — so this exercises Validate's own fail-safe rather than
		// Schema's registration-time rejection of the same thing.
		$screen = [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[
							'id'         => 'name',
							'kind'       => 'text',
							'label'      => 'Name',
							'required'   => true,
							'depends_on' => [ 'field' => 'ghost', 'value' => true ],
						],
					] ],
				] ],
			],
		];

		$errors = Validate::run( $screen, [ 'name' => '' ] );
		$this->assertArrayHasKey( 'name', $errors );
	}

	private function timelineScreen(): array {
		return Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'plan', 'label' => 'Plan', 'panels' => [
					[ 'id' => 'phases', 'title' => 'Phases', 'fields' => [
						[ 'id' => 'timeline', 'kind' => 'gantt', 'label' => 'Project timeline' ],
					] ],
				] ],
			],
		] );
	}

	public function test_a_phase_that_ends_before_it_starts_is_rejected(): void {
		$errors = Validate::run( $this->timelineScreen(), [ 'timeline' => [
			[ 'id' => 'p1', 'title' => 'Discovery', 'start' => 6, 'end' => 2, 'kind' => 'pre', 'visible' => true ],
		] ] );

		$this->assertArrayHasKey( 'timeline', $errors );
		$this->assertStringContainsString( 'Discovery', $errors['timeline'] );
		$this->assertStringContainsString( 'ends before it starts', $errors['timeline'] );
	}

	public function test_only_one_phase_may_be_the_launch_milestone(): void {
		$errors = Validate::run( $this->timelineScreen(), [ 'timeline' => [
			[ 'id' => 'p1', 'title' => 'Launch', 'start' => 15, 'end' => 15, 'kind' => 'launch', 'visible' => true ],
			[ 'id' => 'p2', 'title' => 'Relaunch', 'start' => 20, 'end' => 20, 'kind' => 'launch', 'visible' => true ],
		] ] );

		$this->assertArrayHasKey( 'timeline', $errors );
		$this->assertStringContainsString( 'one launch milestone', $errors['timeline'] );
	}

	public function test_a_workable_timeline_returns_no_errors(): void {
		$errors = Validate::run( $this->timelineScreen(), [ 'timeline' => [
			[ 'id' => 'p1', 'title' => 'Discovery', 'start' => 1, 'end' => 2, 'kind' => 'pre', 'visible' => true ],
			[ 'id' => 'p2', 'title' => 'Launch', 'start' => 15, 'end' => 15, 'kind' => 'launch', 'visible' => true ],
			[ 'id' => 'p3', 'title' => 'Optimisation', 'start' => 18, 'end' => 26, 'kind' => 'post', 'visible' => true ],
		] ] );

		$this->assertSame( [], $errors );
	}
}
