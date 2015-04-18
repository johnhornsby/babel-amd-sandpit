export default class Person {

	constructor(name) {

		this.name = name;

		
		var __age = 0;

		Object.defineProperty(this, "age", {
			get: () => __age,
			set: (value) => __age = value
		});

	}
}