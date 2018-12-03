class NodeAddress {
    /**
     * @param {string} path 
     * @param {number} pageNr 
     * @param {number} recordNr 
     */
    constructor(path, pageNr, recordNr) {
        this.path = path;
        this.pageNr = pageNr;
        this.recordNr = recordNr;
    }

    toString() {
        return `"/${this.path}" @${this.pageNr},${this.recordNr}`;
    }

    /**
     * Compares this address to another address
     * @param {NodeAddress} address 
     */
    equals(address) {
        return this.path === address.path && this.pageNr === address.pageNr && this.recordNr === address.recordNr;
    }
}

module.exports = { NodeAddress };