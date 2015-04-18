export default class Person {

	constructor(name) {
		this.name = name;
		this.age = null;
	}

	setAge (age) {
		this.age = age;
	}

	getAge () {
		return this.age;
	}

}