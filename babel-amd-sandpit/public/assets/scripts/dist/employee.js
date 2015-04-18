define(["exports", "module", "person"], function (exports, module, _person) {
	"use strict";

	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

	var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

	var _Person2 = _interopRequire(_person);

	// this will not work properly across instances of Employee,
	// setting this on any instance will change it for all.

	// use of a Symbol here avoids this, see person.js
	var __salery = 15000;

	var Employee = (function (_Person) {
		function Employee(name) {
			_classCallCheck(this, Employee);

			_get(Object.getPrototypeOf(Employee.prototype), "constructor", this).call(this, name);
		}

		_inherits(Employee, _Person);

		_createClass(Employee, [{
			key: "salery",
			set: function (value) {
				__salery = value;
			},
			get: function () {
				return __salery;
			}
		}]);

		return Employee;
	})(_Person2);

	module.exports = Employee;
});