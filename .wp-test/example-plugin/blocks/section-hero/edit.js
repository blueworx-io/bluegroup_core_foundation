/**
 * The hero section in the block editor.
 *
 * Plain JavaScript on the React WordPress already loads: no build step. The
 * words are edited in place; the button lives in the sidebar. Nothing here
 * decides how the section looks — render.php does that, for the page and
 * for this preview alike, through the server-side render.
 */
( function () {
	'use strict';

	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var be = wp.blockEditor;

	function Edit( props ) {
		var a = props.attributes;
		var set = props.setAttributes;
		var blockProps = be.useBlockProps( { className: 'bwx-hero' } );

		return el(
			wp.element.Fragment,
			null,
			el(
				be.InspectorControls,
				null,
				el(
					wp.components.PanelBody,
					{ title: __( 'Button', 'bwx' ) },
					el( wp.components.TextControl, {
						__nextHasNoMarginBottom: true,
						label: __( 'Button label', 'bwx' ),
						value: a.buttonLabel,
						onChange: function ( v ) { set( { buttonLabel: v } ); },
					} ),
					el( wp.components.TextControl, {
						__nextHasNoMarginBottom: true,
						label: __( 'Button address', 'bwx' ),
						type: 'url',
						value: a.buttonUrl,
						onChange: function ( v ) { set( { buttonUrl: v } ); },
					} )
				)
			),
			el(
				'section',
				blockProps,
				el(
					'div',
					{ className: 'bwx-hero__inner' },
					el( be.RichText, {
						tagName: 'p',
						className: 'bwx-hero__eyebrow',
						placeholder: __( 'Eyebrow', 'bwx' ),
						value: a.eyebrow,
						allowedFormats: [],
						onChange: function ( v ) { set( { eyebrow: v } ); },
					} ),
					el( be.RichText, {
						tagName: 'h2',
						className: 'bwx-hero__heading',
						placeholder: __( 'Heading', 'bwx' ),
						value: a.heading,
						allowedFormats: [ 'core/italic' ],
						onChange: function ( v ) { set( { heading: v } ); },
					} ),
					el( be.RichText, {
						tagName: 'p',
						className: 'bwx-hero__text',
						placeholder: __( 'A line of text', 'bwx' ),
						value: a.text,
						allowedFormats: [ 'core/bold', 'core/italic', 'core/link' ],
						onChange: function ( v ) { set( { text: v } ); },
					} ),
					a.buttonLabel
						? el( 'span', { className: 'bwx-hero__button wp-element-button' }, a.buttonLabel )
						: null
				)
			)
		);
	}

	wp.blocks.registerBlockType( 'bwx/section-hero', {
		edit: Edit,
		// Nothing is saved but the attributes: render.php draws the section.
		save: function () { return null; },
	} );
}() );
