const Enum = require("./Enum")

module.exports = class NameType extends Enum {
    static Original = new NameType("name_type_original", 0)
    static Japanese = new NameType("name_type_japanese", 1)
    static English = new NameType("name_type_english", 2)
    static Romaji = new NameType("name_type_romaji", 3)

    static {
        const enums = Object.values(this)

        const values = []
        const map = {}

        // build the values and map tables/objects
        enums.forEach(value => {
            values[value.id] = value
            map[value.name] = value
        })

        // add to object
        this.values = values
        this.map = map
    }
}