<?php
namespace Blueworx\PageEditor\v1;

/**
 * The whole public surface of the library. A plugin calls register() with its
 * screen definition and does nothing else.
 */
final class Editor {

	/** @var array<string,array> slug => screen definition */
	private static $screens = [];

	public static function register( array $screen ): void {
		$screen = Schema::validate( $screen );
		self::$screens[ $screen['slug'] ] = $screen;
	}

	/** @return array<string,array> */
	public static function all(): array {
		return self::$screens;
	}

	public static function get( string $slug ): ?array {
		return self::$screens[ $slug ] ?? null;
	}

	public static function reset(): void {
		self::$screens = [];
	}
}
