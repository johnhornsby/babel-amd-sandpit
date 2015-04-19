// Using a symbol here seems to ensure we have unique references per instance
const HEIGHT = Symbol();

export default class Person {

	constructor(name) {

		this.name = name;
		
		// Using a symbol allows us to also keep the variable private but use the getters and setters outside of the constructor
		this[HEIGHT] = 0;

		// This allows us to use a private variable that is scoped internally.
		var __age = 0;

		Object.defineProperty(this, "age", {
			get: () => __age,
			set: (value) => __age = value
		});

	}

	get height() {
		return this[HEIGHT];
	}

	set height(value) {
		this[HEIGHT] = value;
	}


}