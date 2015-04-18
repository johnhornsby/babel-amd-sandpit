export default class Person {

	constructor(name) {

		this.name = name;

		this.__height = 0;
		
		var __age = 0;

		Object.defineProperty(this, "age", {
			get: () => __age,
			set: (value) => __age = value
		});

	}

	get height() {
		return this.__height;
	}

	set height(value) {
		this.__height = value;
	}



}