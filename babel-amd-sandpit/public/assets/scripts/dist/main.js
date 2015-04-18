require(["person"], function(Person) {
	
	var me = new Person("John Hornsby");
	me.setAge("39");

	alert(me.name + " you are " + me.getAge() + "years old");

});