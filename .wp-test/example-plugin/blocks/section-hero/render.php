<?php
/**
 * The hero section, drawn on the server.
 *
 * The saved page holds only the block's name and its words (see block.json:
 * there is no save() markup). Everything about how it looks is decided here,
 * on every request, so a change to this file reaches every page that already
 * uses the block.
 *
 * @var array $attributes The block's attributes.
 */

defined( 'ABSPATH' ) || exit;

$bwx_eyebrow = isset( $attributes['eyebrow'] ) ? (string) $attributes['eyebrow'] : '';
$bwx_heading = isset( $attributes['heading'] ) ? (string) $attributes['heading'] : '';
$bwx_text    = isset( $attributes['text'] ) ? (string) $attributes['text'] : '';
$bwx_label   = isset( $attributes['buttonLabel'] ) ? (string) $attributes['buttonLabel'] : '';
$bwx_url     = isset( $attributes['buttonUrl'] ) ? (string) $attributes['buttonUrl'] : '';
?>
<section <?php echo get_block_wrapper_attributes( array( 'class' => 'bwx-hero' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped by core. ?>>
	<div class="bwx-hero__inner">
		<?php if ( '' !== $bwx_eyebrow ) : ?>
			<p class="bwx-hero__eyebrow"><?php echo esc_html( $bwx_eyebrow ); ?></p>
		<?php endif; ?>
		<?php if ( '' !== $bwx_heading ) : ?>
			<h2 class="bwx-hero__heading"><?php echo wp_kses_post( $bwx_heading ); ?></h2>
		<?php endif; ?>
		<?php if ( '' !== $bwx_text ) : ?>
			<p class="bwx-hero__text"><?php echo wp_kses_post( $bwx_text ); ?></p>
		<?php endif; ?>
		<?php if ( '' !== $bwx_label && '' !== $bwx_url ) : ?>
			<a class="bwx-hero__button wp-element-button" href="<?php echo esc_url( $bwx_url ); ?>"><?php echo esc_html( $bwx_label ); ?></a>
		<?php endif; ?>
	</div>
</section>
