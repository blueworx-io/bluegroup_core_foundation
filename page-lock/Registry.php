<?php
/**
 * Which copy of the page lock runs.
 *
 * @package BlueworxPageLock
 */

namespace Blueworx\PageLock;

/**
 * Every copy on the site announces itself; the highest version is loaded, once.
 */
final class Registry {

	/**
	 * Version => folder holding that copy.
	 *
	 * @var array<string,string>
	 */
	private static $copies = array();

	/**
	 * Whether a copy has been loaded.
	 *
	 * @var bool
	 */
	private static $loaded = false;

	/**
	 * Records a copy.
	 *
	 * @param string $version Version of the copy.
	 * @param string $dir     The copy's folder.
	 * @return void
	 */
	public static function add( $version, $dir ) {
		self::$copies[ (string) $version ] = (string) $dir;
	}

	/**
	 * The highest version announced.
	 *
	 * @return string
	 */
	public static function latest() {
		$versions = array_keys( self::$copies );
		usort( $versions, 'version_compare' );
		return (string) end( $versions );
	}

	/**
	 * The web address of a folder inside wp-content, or '' if it is not in it.
	 *
	 * Works the same for a theme and a plugin, which plugins_url() does not.
	 *
	 * @param string $dir     Folder on disk.
	 * @param string $content wp-content on disk.
	 * @param string $base    wp-content's web address.
	 * @return string
	 */
	public static function url_for( $dir, $content, $base ) {
		$dir     = rtrim( str_replace( '\\', '/', (string) $dir ), '/' );
		$content = rtrim( str_replace( '\\', '/', (string) $content ), '/' );
		if ( '' === $content || 0 !== strpos( $dir . '/', $content . '/' ) ) {
			return '';
		}
		return rtrim( (string) $base, '/' ) . substr( $dir, strlen( $content ) ) . '/';
	}

	/**
	 * Loads and starts the winning copy.
	 *
	 * @return void
	 */
	public static function load() {
		if ( self::$loaded || ! self::$copies ) {
			return;
		}
		self::$loaded = true;

		$version = self::latest();
		$dir     = self::$copies[ $version ];
		require_once $dir . '/v1/Lock.php';

		\Blueworx\PageLock\v1\Lock::boot( self::web_address( $dir ), $version );
	}

	/**
	 * The web address of the winning copy's folder.
	 *
	 * Tries wp-content, then the active theme, then a plugin folder linked in
	 * from elsewhere (as on a local test site), whose real path WordPress keeps.
	 *
	 * @param string $dir The copy's folder.
	 * @return string
	 */
	private static function web_address( $dir ) {
		$roots = array();
		if ( defined( 'WP_CONTENT_DIR' ) && function_exists( 'content_url' ) ) {
			$roots[] = array( WP_CONTENT_DIR, content_url() );
		}
		if ( function_exists( 'get_stylesheet_directory' ) ) {
			$roots[] = array( get_stylesheet_directory(), get_stylesheet_directory_uri() );
			$roots[] = array( get_template_directory(), get_template_directory_uri() );
		}
		foreach ( $roots as $root ) {
			foreach ( array_unique( array( $root[0], (string) realpath( $root[0] ) ) ) as $path ) {
				$url = self::url_for( $dir, $path, $root[1] );
				if ( '' !== $url ) {
					return $url;
				}
			}
		}
		if ( defined( 'WP_PLUGIN_DIR' ) && function_exists( 'plugin_basename' ) ) {
			$file = WP_PLUGIN_DIR . '/' . plugin_basename( $dir . '/blueworx-page-lock.php' );
			if ( file_exists( $file ) ) {
				return rtrim( plugins_url( '', $file ), '/' ) . '/';
			}
		}
		return '';
	}
}
