import Person from "person";

// this will not work properly across instances of Employee, 
// setting this on any instance will change it for all.

// use of a Symbol here avoids this, see person.js
var __salery = 15000;

export default class Employee extends Person {

	constructor(name) {
		super(name);
	}

	set salery(value) {
		__salery = value;
	}

	get salery() {
		return __salery;
	}
}