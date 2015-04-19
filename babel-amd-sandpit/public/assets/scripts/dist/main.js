define(["exports", "person", "employee", "manager", "require"], function (exports, _person, _employee, _manager, _require) {
  "use strict";

  var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

  var _Person = _interopRequire(_person);

  var _Employee = _interopRequire(_employee);

  var _Manager = _interopRequire(_manager);

  var _require2 = _interopRequire(_require);

  var me = new _Person("John Hornsby");

  var efan = new _Employee("Efan Hornsby");
  efan.age = 5;
  efan.height = 1.2;
  efan.salery = 15000;

  var wendy = new _Manager("Wendy Finnie");
  wendy.age = 53;
  wendy.height = 1.8;
  wendy.salery = 20000;

  console.log("" + wendy.name + " is " + wendy.age + " years old and is " + wendy.height + " tall and earns " + wendy.salery + "k");

  console.log(efan.name + " is " + efan.age + " years old and is " + efan.height + " tall and earns " + efan.salery + "k");
  console.log("Efans salery has the same reference as Wendys, however the height does not. Height uses Symbols");
});
//# sourceMappingURL=main.js.map