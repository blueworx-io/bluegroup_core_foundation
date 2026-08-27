<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;

final class EditorTest extends TestCase {
	public function test_a_screen_with_no_slug_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'needs a slug' );
		Editor::register( [] );
	}
}
