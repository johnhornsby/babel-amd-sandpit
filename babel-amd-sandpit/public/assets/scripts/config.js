requirejs.config({
	include: [
		'../js/lib/browser-polyfill.js',
		'../../bower_components/requirejs/require',
		'main'
	],
	insertRequire: ['main'],
	generateSourceMaps: true,
	preserveLicenseComments: false

})