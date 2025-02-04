module.exports = class Enum {

    constructor(name, id) {
        this.name = name
        this.id = id
    }

    /**
     * Returns a new ArtistType based on the id provided.
     * 
     * @param {number} id 
     * @returns A ArtistType enum that corresponds to the provided id 
     */
    static fromId(id) {
        return this.values[id]
    }

}