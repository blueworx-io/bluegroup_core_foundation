<?php
namespace Blueworx\PageEditor\v1;

/**
 * Two places a screen's values can live, behind one door.
 *
 * A record's values are post meta keyed by post type and field id, so two
 * screens on one site cannot collide. A settings screen keeps everything in a
 * single option, because it is one thing.
 */
abstract class Store {

	/** @var array */
	protected $screen;

	protected function __construct( array $screen ) {
		$this->screen = $screen;
	}

	public static function for( array $screen ): Store {
		return 'option' === $screen['store'] ? new OptionStore( $screen ) : new PostStore( $screen );
	}

	abstract public function read( int $id = 0 ): array;

	abstract public function write( array $values, int $id = 0 ): bool;

	/** @return array[] */
	protected function fields(): array {
		return Sanitise::fields( $this->screen );
	}
}

final class PostStore extends Store {

	public function read( int $id = 0 ): array {
		$out = [];
		foreach ( $this->fields() as $field ) {
			$out[ $field['id'] ] = get_post_meta( $id, $this->key( $field['id'] ), true );
		}
		return $out;
	}

	public function write( array $values, int $id = 0 ): bool {
		foreach ( $values as $key => $value ) {
			update_post_meta( $id, $this->key( $key ), $value );
		}
		return true;
	}

	private function key( string $field ): string {
		return $this->screen['post_type'] . '_' . $field;
	}
}

final class OptionStore extends Store {

	public function read( int $id = 0 ): array {
		$saved = get_option( $this->screen['option_name'], [] );
		$saved = is_array( $saved ) ? $saved : [];
		$out   = [];
		foreach ( $this->fields() as $field ) {
			$out[ $field['id'] ] = $saved[ $field['id'] ] ?? '';
		}
		return $out;
	}

	public function write( array $values, int $id = 0 ): bool {
		$saved = get_option( $this->screen['option_name'], [] );
		$saved = is_array( $saved ) ? $saved : [];
		return update_option( $this->screen['option_name'], array_merge( $saved, $values ) );
	}
}
