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

	function openListView() {
		var stores = [ 'core/editor', 'core/edit-post' ];
		for ( var i = 0; i < stores.length; i++ ) {
			var actions = wp.data.dispatch( stores[ i ] );
			if ( actions && typeof actions.setIsListViewOpened === 'function' ) {
				actions.setIsListViewOpened( true );
				return;
			}
		}
	}

	function PageLockPanel() {
		var meta = wp.data.useSelect( function ( select ) {
			return select( 'core/editor' ).getEditedPostAttribute( 'meta' ) || {};
		}, [] );
		var isOpen = wp.data.useSelect( function ( select ) {
			return select( 'core/editor' ).isEditorPanelOpened( panelName );
		}, [] );
		var editor = wp.data.useDispatch( 'core/editor' );
		var locked = !! meta[ config.metaKey ];

		// The structure panel opens once, when the editor first draws. Closing
		// it afterwards is the person's choice and is left alone.
		wp.element.useEffect( function () {
			if ( config.openListView ) {
				openListView();
			}
		}, [] );

		// A locked page's notice has to be readable without a click.
		wp.element.useEffect( function () {
			if ( locked && ! isOpen ) {
				editor.toggleEditorPanelOpened( panelName );
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
