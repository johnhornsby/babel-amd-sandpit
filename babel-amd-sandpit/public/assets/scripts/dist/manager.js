define(["exports", "module", "employee"], function (exports, module, _employee) {
	"use strict";

	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

	var _Employee2 = _interopRequire(_employee);

	var Manager = (function (_Employee) {
		function Manager(name) {
			_classCallCheck(this, Manager);

			_get(Object.getPrototypeOf(Manager.prototype), "constructor", this).call(this, name);
		}

		_inherits(Manager, _Employee);

		return Manager;
	})(_Employee2);

	module.exports = Manager;
});
//# sourceMappingURL=manager.js.map