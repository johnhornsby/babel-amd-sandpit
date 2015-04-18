define(["exports", "module"], function (exports, module) {
	"use strict";

	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

	var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

	// Using a symbol here seems to ensure we have unique references per instance
	var HEIGHT = Symbol();

	var Person = (function () {
		function Person(name) {
			_classCallCheck(this, Person);

			this.name = name;

			// Using a symbol allows us to also keep the variable private but use the getters and setters outside of the constructor
			this[HEIGHT] = 0;

			// This allows us to use a private variable that is scoped internally.
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
				return this[HEIGHT];
			},
			set: function (value) {
				this[HEIGHT] = value;
			}
		}]);

		return Person;
	})();

	module.exports = Person;
});
//# sourceMappingURL=person.js.map