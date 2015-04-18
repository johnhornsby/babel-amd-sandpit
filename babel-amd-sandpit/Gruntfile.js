module.exports = function(grunt) {
	
	grunt.initConfig({
		pkg: grunt.file.readJSON("package.json"),
		babel: {
			options: {
				modules: "amd"
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
		}
	});

	grunt.loadNpmTasks("grunt-babel");
	grunt.loadNpmTasks("grunt-develop");
	grunt.loadNpmTasks("grunt-contrib-watch");

	grunt.registerTask("default", ["babel", "develop", "watch"]);

};