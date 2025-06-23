# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  # Use Ubuntu 24.04 (Noble Numbat)
  config.vm.box = "ubuntu/noble64"

  # Network settings
  config.vm.network "private_network", ip: "192.168.56.10"
  
  # Port forwarding for web access
  config.vm.network "forwarded_port", guest: 6274, host: 6274

  # Port forwarding for web access
  config.vm.network "forwarded_port", guest: 6277, host: 6277

  # Port forwarding for Starreach server
  config.vm.network "forwarded_port", guest: 8000, host: 8000

  # Mount the current directory
  config.vm.synced_folder ".", "/home/vagrant/project",
    create: true,
    type: "virtualbox",
    owner: "vagrant",
    group: "vagrant"

  # Provider-specific settings
  config.vm.provider "virtualbox" do |vb|
    vb.memory = "4096"  # 4GB RAM minimum
    vb.cpus = 2
    vb.name = "noble-starreach"
  end

  # Provision the VM with required dependencies
  config.vm.provision "shell", inline: <<-SHELL
    apt-get update
    apt-get install -y curl git ripgrep python3 python3-pip python3-venv

    # Install Node.js 18+
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    apt-get install -y nodejs

    # Verify Node.js installation
    echo "Node.js version: $(node -v)"
    echo "npm version: $(npm -v)"

    # Create a new Python virtual environment in the VM (outside shared folder)
    cd /home/vagrant
    python3 -m venv venv_linux
    source venv_linux/bin/activate
    pip install --upgrade pip
    cd /home/vagrant/project
    pip install -r requirements.txt

    # Add automatic cd to project directory and activate venv in .bashrc
    echo 'cd ~/project' >> /home/vagrant/.bashrc
    echo 'source ~/venv_linux/bin/activate' >> /home/vagrant/.bashrc

    # Create a welcome message
    echo '
    ==================================================
    Ubuntu 24.04 (Noble Numbat) VM set up successfully

    To use MCP Inspector:
    1. HOST=0.0.0.0 npx @modelcontextprotocol/inspector@latest

    In the MCP Inspector, use
    python
    starreach.py

    To run Starreach:
    1. cd ~/project
    2. source venv_linux/bin/activate
    3. python starreach.py

    Your local directory is mounted at ~/project in the VM
    ==================================================
    ' > /etc/motd
  SHELL
end