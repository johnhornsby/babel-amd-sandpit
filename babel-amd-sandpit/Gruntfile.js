module.exports = function(grunt) {
	
	grunt.initConfig({
		pkg: grunt.file.readJSON("package.json"),
		babel: {
			options: {
				modules: "amd",
				sourceMap: true
			},
			dist: {
				files: [
					{
						expand: true,
						cwd: "public/assets/scripts/src/",
						src: ["**/*.js"],
						dest: "public/assets/scripts/dist/",
						ext: ".js"
					}
				]
			}
		},
		develop: {
			server: {
				file: 'server.js'
			}
		},
		watch: {
			js: {
				files: [
				'public/assets/scripts/dist/**/*.js'
				],
				tasks: ['develop'],
				options: { nospawn: true }
			},
			es6: {
				files: [
				'public/assets/scripts/src/**/*.js'
				],
				tasks: ["babel"],
				options: { nospawn: true }
			}
		},
		requirejs: {
			compile: {
				options: {
					// url that is relative to the require paths
					baseUrl: "public/assets/scripts/dist/",
					mainConfigFile: "public/assets/scripts/config.js",
					name: "main",
					out: "public/assets/scripts/js/app.js",
					optimize: "none"
				}
			}
		}
	});

	grunt.loadNpmTasks("grunt-babel");
	grunt.loadNpmTasks("grunt-develop");
	grunt.loadNpmTasks("grunt-contrib-watch");
	grunt.loadNpmTasks('grunt-contrib-requirejs');

	grunt.registerTask("default", ["build", "develop", "watch"]);

	grunt.registerTask("build", ["babel", "requirejs"]);

};