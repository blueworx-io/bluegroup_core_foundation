<?php
namespace Blueworx\PageEditor\v1;

use InvalidArgumentException;

/**
 * A screen definition is data, so every mistake in it is caught here, loudly,
 * at registration — never as a silently missing field on a live screen.
 */
final class Schema {

	public static function validate( array $screen ): array {
		if ( empty( $screen['slug'] ) || ! is_string( $screen['slug'] ) ) {
			throw new InvalidArgumentException( 'This editor screen needs a slug.' );
		}
		return $screen;
	}
}
