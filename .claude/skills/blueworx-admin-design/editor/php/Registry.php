<?php
namespace Blueworx\PageEditor;

/**
 * Which copy of the library actually runs. Every copy on the site announces
 * itself; the highest version is the one loaded, once.
 */
final class Registry {

	/** @var array<string,string> version => directory */
	private static $copies = [];

	/** @var bool */
	private static $loaded = false;

	public static function add( string $version, string $dir ): void {
		self::$copies[ $version ] = $dir;
	}

	public static function latest(): string {
		$versions = array_keys( self::$copies );
		usort( $versions, 'version_compare' );
		return (string) end( $versions );
	}

	public static function load(): void {
		if ( self::$loaded ) {
			return;
		}
		self::$loaded = true;
		$dir = self::$copies[ self::latest() ];
		foreach ( [ 'Schema', 'Capabilities', 'Sanitise', 'Validate', 'Store', 'Settings', 'Rest', 'Screen', 'Editor' ] as $class ) {
			require_once $dir . '/' . $class . '.php';
		}
	}
}
