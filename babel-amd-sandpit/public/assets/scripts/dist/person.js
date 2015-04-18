define(["exports", "module"], function (exports, module) {
	"use strict";

	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

	var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

	var Person = (function () {
		function Person(name) {
			_classCallCheck(this, Person);

			this.name = name;

			this.__height = 0;

			var __age = 0;

			Object.defineProperty(this, "age", {
				get: function get() {
					return __age;
				},
				set: function set(value) {
					return __age = value;
				}
			});
		}

		_createClass(Person, [{
			key: "height",
			get: function () {
				return this.__height;
			},
			set: function (value) {
				this.__height = value;
			}
		}]);

		return Person;
	})();

	module.exports = Person;
});