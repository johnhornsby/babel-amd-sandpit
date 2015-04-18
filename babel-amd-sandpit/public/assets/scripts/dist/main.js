require(["person", "employee"], function(Person, Employee) {
	
	var me = new Person("John Hornsby");

	var Efan = new Employee("Efan Hornsby");
	Efan.age = 5;
	Efan.height = 1.2;

	console.log(Efan.name + " is " + Efan.age + " years old, and is " + Efan.height + "m tall.");

});