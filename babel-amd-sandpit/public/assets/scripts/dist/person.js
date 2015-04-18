define(["exports", "module"], function (exports, module) {
	"use strict";

	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

	var Person = function Person(name) {
		_classCallCheck(this, Person);

		this.name = name;

		var __age = 0;

		Object.defineProperty(this, "age", {
			get: function get() {
				return __age;
			},
			set: function set(value) {
				return __age = value;
			}
		});
	};

	module.exports = Person;
});