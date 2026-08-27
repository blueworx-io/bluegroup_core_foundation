<?php
namespace Blueworx\PageEditor\v1;

/**
 * Two places a screen's values can live, behind one door.
 *
 * A record's values are post meta keyed by post type and field id, so two
 * screens on one site cannot collide — except for the handful of ids that are
 * WordPress's own post columns, tags and featured image (see
 * PostStore::POST_COLUMNS), which have to be read and written through the
 * post itself or they do nothing: a status stored as meta does not publish
 * anything, and a slug stored as meta does not change the address. A settings
 * screen keeps everything in a single option, because it is one thing.
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

	/**
	 * Field ids that are columns on the post itself, not post meta. This is
	 * the one place that decides what is a column and what is meta — kept as
	 * a single list rather than duplicated between reading and writing.
	 */
	const POST_COLUMNS = [
		'post_status', 'post_name', 'post_excerpt', 'post_author',
		'post_date', 'post_parent', 'menu_order', 'comment_status',
	];

	public function read( int $id = 0 ): array {
		$out  = [];
		$post = null;

		foreach ( $this->fields() as $field ) {
			$key = $field['id'];

			if ( in_array( $key, self::POST_COLUMNS, true ) ) {
				if ( null === $post ) {
					$post = get_post( $id );
				}
				$raw         = ( $post && isset( $post->$key ) ) ? $post->$key : '';
				$out[ $key ] = $this->fromColumn( $key, $raw );
				continue;
			}

			if ( 'post_tags' === $key ) {
				$out[ $key ] = wp_get_post_terms( $id, 'post_tag', [ 'fields' => 'names' ] );
				continue;
			}

			if ( 'featured_image' === $key ) {
				$out[ $key ] = get_post_thumbnail_id( $id );
				continue;
			}

			$out[ $key ] = get_post_meta( $id, $this->key( $key ), true );
		}

		return $out;
	}

	/**
	 * Post meta, and the post itself, have no transaction: a real failure
	 * part-way through leaves whatever came before it already committed. This
	 * stops at the first genuine failure rather than carrying on and
	 * pretending the fields after it were never attempted.
	 */
	public function write( array $values, int $id = 0 ): bool {
		$columns = [];

		foreach ( $values as $key => $value ) {
			if ( in_array( $key, self::POST_COLUMNS, true ) ) {
				if ( ! $this->skipColumn( $key, $value ) ) {
					$columns[ $key ] = $this->toColumn( $key, $value );
				}
				continue;
			}

			if ( 'post_tags' === $key ) {
				$result = wp_set_post_terms( $id, (array) $value, 'post_tag' );
				// wp_set_post_terms() reports failure as either false or a
				// WP_Error — both are truthy in a naive `if ( ! $result )`,
				// so both have to be checked for explicitly.
				if ( false === $result || is_wp_error( $result ) ) {
					return false;
				}
				continue;
			}

			if ( 'featured_image' === $key ) {
				if ( (int) $value > 0 ) {
					if ( ! $this->writeThumbnail( $id, (int) $value ) ) {
						return false;
					}
				} else {
					delete_post_thumbnail( $id );
				}
				continue;
			}

			if ( ! $this->writeMeta( $id, $this->key( $key ), $value ) ) {
				return false;
			}
		}

		if ( $columns && ! wp_update_post( array_merge( $columns, [ 'ID' => $id ] ) ) ) {
			return false;
		}

		return true;
	}

	/**
	 * update_post_meta() returns false both on a genuine failure and, in real
	 * WordPress, whenever the new value is identical to the one already
	 * stored. Comparing first means a false return here always means a real
	 * failure — and a no-op re-save is never mistaken for one.
	 */
	private function writeMeta( int $id, string $key, $value ): bool {
		if ( get_post_meta( $id, $key, true ) === $value ) {
			return true;
		}
		return (bool) update_post_meta( $id, $key, $value );
	}

	/**
	 * set_post_thumbnail() calls update_post_meta() internally, so it has the
	 * exact same no-op-returns-false quirk as writeMeta() above.
	 */
	private function writeThumbnail( int $id, int $thumbnail_id ): bool {
		if ( get_post_thumbnail_id( $id ) === $thumbnail_id ) {
			return true;
		}
		return (bool) set_post_thumbnail( $id, $thumbnail_id );
	}

	/**
	 * A couple of columns store a different shape than the field kind that
	 * edits them: comment_status is WordPress's 'open'/'closed' string, not
	 * the bool a toggle gives Sanitise; post_date is 'Y-m-d H:i:s', not the
	 * 'Y-m-d\TH:i' a datetime field sends. Kept next to POST_COLUMNS so the
	 * one place that knows a field is a column is also the place that knows
	 * how to translate it — in both directions, see fromColumn() below.
	 */
	private function toColumn( string $key, $value ) {
		if ( 'comment_status' === $key ) {
			return $value ? 'open' : 'closed';
		}
		if ( 'post_date' === $key ) {
			return str_replace( 'T', ' ', (string) $value ) . ':00';
		}
		return $value;
	}

	/**
	 * Whether a column has to be left out of the array altogether rather than
	 * written. An empty post_date is not "leave it alone" to wp_update_post():
	 * it resets the publish date to now, so a site owner clearing the field —
	 * or a screen where it was never set — would quietly change when the
	 * record claims to have been published. Omitting the key is the only way
	 * to say nothing.
	 */
	private function skipColumn( string $key, $value ): bool {
		return 'post_date' === $key && '' === (string) $value;
	}

	private function fromColumn( string $key, $value ) {
		if ( 'comment_status' === $key ) {
			return 'open' === $value;
		}
		if ( 'post_date' === $key ) {
			$raw = (string) $value;
			// An all-zero date is WordPress's "no date". Sent as it stands the
			// browser would show 0000-00-00, which is worse than blank.
			if ( strlen( $raw ) < 16 || 0 === strpos( $raw, '0000-00-00' ) ) {
				return '';
			}
			return substr( str_replace( ' ', 'T', $raw ), 0, 16 );
		}
		return $value;
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

	/**
	 * update_option() has the same no-op-returns-false quirk as
	 * update_post_meta() — see PostStore::writeMeta() — so this only calls it
	 * once the merged value genuinely differs from what is already saved.
	 */
	public function write( array $values, int $id = 0 ): bool {
		$saved  = get_option( $this->screen['option_name'], [] );
		$saved  = is_array( $saved ) ? $saved : [];
		$merged = array_merge( $saved, $values );

		if ( $merged === $saved ) {
			return true;
		}

		return update_option( $this->screen['option_name'], $merged );
	}
}
