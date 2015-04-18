require(["person", "employee", "manager"], function(Person, Employee, Manager) {
	
	var me = new Person("John Hornsby");

	var efan = new Employee("Efan Hornsby");
	efan.age = 5;
	efan.height = 1.2;
	efan.salery = 15000;

	var wendy = new Manager("Wendy Finnie");
	wendy.age = 53;
	wendy.height = 1.8;
	wendy.salery = 20000;

	console.log(wendy.name + " is " + wendy.age + " years old and is " + wendy.height + " tall  and earns " + wendy.salery + "k" );
	console.log(efan.name + " is " + efan.age + " years old and is " + efan.height + " tall and earns " + efan.salery + "k" );
	console.log("Efans salery has the same reference as Wendys, however the height does not. Height uses Symbols")
});