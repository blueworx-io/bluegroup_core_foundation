/**
 * The page lock in the block editor.
 *
 * Administrators get a Locked switch in the page tab. Everyone else, on a
 * locked page, sees a plain line saying what they can still change, and the
 * page structure panel opens so they can jump to any section. Plain
 * JavaScript on the React WordPress already loads: no build step.
 */
( function () {
	'use strict';

	if ( ! window.wp || ! window.blueworxPageLock ) {
		return;
	}

	var config = window.blueworxPageLock;
	var h = wp.element.createElement;
	var Panel = ( wp.editor && wp.editor.PluginDocumentSettingPanel ) || ( wp.editPost && wp.editPost.PluginDocumentSettingPanel );

	if ( ! Panel || ! wp.plugins || ! wp.data ) {
		return;
	}

	var panelName = 'blueworx-page-lock/blueworx-page-lock';

	// Panels and the structure list live in core/editor from WordPress 6.5 and
	// in core/edit-post before it. Finds whichever one has the function wanted.
	function call( from, name, value ) {
		var stores = [ 'core/editor', 'core/edit-post' ];
		for ( var i = 0; i < stores.length; i++ ) {
			var store = from( stores[ i ] );
			if ( store && typeof store[ name ] === 'function' ) {
				return store[ name ]( value );
			}
		}
	}

	// What the server does on the next load of a page that has its layout.
	function lockEditor() {
		wp.data.dispatch( 'core/editor' ).updateEditorSettings( { templateLock: 'all' } );
		var style = document.createElement( 'style' );
		style.textContent = config.noAddButton;
		document.head.appendChild( style );
	}

	function PageLockPanel() {
		var meta = wp.data.useSelect( function ( select ) {
			return select( 'core/editor' ).getEditedPostAttribute( 'meta' ) || {};
		}, [] );
		var isOpen = wp.data.useSelect( function ( select ) {
			return !! call( select, 'isEditorPanelOpened', panelName );
		}, [] );
		// The page as last saved, not as it is being edited.
		var layoutSaved = wp.data.useSelect( function ( select ) {
			return /<!--\s+wp:/.test( select( 'core/editor' ).getCurrentPostAttribute( 'content' ) || '' );
		}, [] );
		var editor = wp.data.useDispatch( 'core/editor' );
		var locked = !! meta[ config.metaKey ];

		// The structure panel opens once, when the editor first draws. Closing
		// it afterwards is the person's choice and is left alone.
		wp.element.useEffect( function () {
			if ( config.openListView ) {
				call( wp.data.dispatch, 'setIsListViewOpened', true );
			}
		}, [] );

		// The server fixes the sections as soon as the first layout is saved, so
		// the open editor stops offering to change them at the same moment.
		wp.element.useEffect( function () {
			if ( config.lockOnSave && layoutSaved ) {
				lockEditor();
			}
		}, [ layoutSaved ] );

		// A locked page's notice has to be readable without a click.
		wp.element.useEffect( function () {
			if ( locked && ! isOpen ) {
				call( wp.data.dispatch, 'toggleEditorPanelOpened', panelName );
			}
		}, [ locked ] );

		var body;
		if ( config.canManage ) {
			body = h( wp.components.ToggleControl, {
				__nextHasNoMarginBottom: true,
				label: config.copy.label,
				help: locked ? config.copy.help : config.copy.unlocked,
				checked: locked,
				onChange: function ( value ) {
					var next = {};
					next[ config.metaKey ] = !! value;
					editor.editPost( { meta: next } );
				},
			} );
		} else if ( locked ) {
			body = h( wp.components.Notice, { status: 'info', isDismissible: false }, config.copy.locked );
		} else {
			return null;
		}

		return h( Panel, { name: 'blueworx-page-lock', title: config.copy.title, className: 'blueworx-page-lock' }, body );
	}

	wp.plugins.registerPlugin( 'blueworx-page-lock', {
		render: PageLockPanel,
		icon: null,
	} );
}() );
